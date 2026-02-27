import { FOOD_PER_PERSON_PER_TICK, isMonthBoundary, isYearBoundary, TICKS_PER_YEAR } from './constants';
import { extractFromClaimedResource, queryClaimedResource, regenerateRenewableResources } from './entities';
import {
    agriculturalProductResourceType,
    putIntoStorageFacility,
    queryStorageFacility,
    removeFromStorageFacility,
} from './facilities';
import { laborMarketMonthTick, laborMarketTick, laborMarketYearTick, totalActiveForEdu } from './workforce';
import type { Agent, EducationLevelType, Occupation, Planet, Population } from './planet';
import { educationLevelKeys, educationLevels, maxAge, OCCUPATIONS } from './planet';
import {
    ageDropoutProbabilityForEducation,
    distributeLike,
    educationGraduationProbabilityForAge,
    emptyCohort,
    mortalityProbability,
    sumCohort,
} from './populationHelpers';

export interface GameState {
    tick: number;
    planets: Planet[];
    agents: Agent[]; // includes governments and companies, can be extended in the future for individuals, organizations, etc.
}

// internalTickCounter has been removed; gameState.tick (incremented by the
// caller before advanceTick is called) is used for all boundary checks.
export function advanceTick(gameState: GameState) {
    environmentTick(gameState);
    laborMarketTick(gameState.agents, gameState.planets);
    populationTick(gameState);
    productionTick(gameState);

    if (isMonthBoundary(gameState.tick)) {
        laborMarketMonthTick(gameState.agents, gameState.planets);
    }

    if (isYearBoundary(gameState.tick)) {
        populationAdvanceYearTick(gameState);
        laborMarketYearTick(gameState.agents);
    }
}

// Convert annual rates to per-tick equivalents to smooth mortality over ticks
const convertAnnualToPerTick = (annualRate: number) => {
    if (annualRate >= 1) {
        return 1;
    }
    return 1 - Math.pow(1 - annualRate, 1 / TICKS_PER_YEAR);
};

export function productionTick(gameState: GameState) {
    gameState.agents.forEach((agent) => {
        gameState.planets.forEach((planet) => {
            const assets = agent.assets[planet.id];

            if (!assets) {
                return; // this agent has no assets on this planet, skip
            }

            // Build remaining worker pool from actual workforce demography
            // (how many are really hired), not from allocatedWorkers (the target).
            const remainingWorker = {} as Record<EducationLevelType, number>;
            const workforce = assets.workforceDemography;
            for (const edu of educationLevelKeys) {
                remainingWorker[edu] = workforce ? totalActiveForEdu(workforce, edu) : 0;
            }
            assets.productionFacilities.forEach((facility) => {
                // --- Worker allocation with downhill fallback ---
                // For each required education level, try exact match first.
                // If not enough workers, fall through to higher education levels.
                // Education hierarchy (low→high): none, primary, secondary, tertiary, quaternary
                const workerAllocation: Record<EducationLevelType, { total: number; overqualified: number }> = {
                    none: { total: 0, overqualified: 0 },
                    primary: { total: 0, overqualified: 0 },
                    secondary: { total: 0, overqualified: 0 },
                    tertiary: { total: 0, overqualified: 0 },
                    quaternary: { total: 0, overqualified: 0 },
                };

                let reducedEfficiencyDueToWorkers = 1;
                for (const [eduLevel, req] of Object.entries(facility.workerRequirement)) {
                    if (!req || req <= 0) {
                        continue;
                    }

                    const jobEdu = eduLevel as EducationLevelType;
                    const jobEduIdx = educationLevelKeys.indexOf(jobEdu);
                    let needed = req;
                    let filled = 0;
                    let overqualified = 0;

                    // Walk from the exact education level upward through higher qualifications
                    for (let i = jobEduIdx; i < educationLevelKeys.length && needed > 0; i++) {
                        const candidateEdu = educationLevelKeys[i];
                        const available = remainingWorker[candidateEdu] || 0;
                        const take = Math.min(needed, available);
                        if (take > 0) {
                            filled += take;
                            needed -= take;
                            if (i > jobEduIdx) {
                                overqualified += take;
                            }
                        }
                    }

                    workerAllocation[jobEdu] = { total: filled, overqualified };
                    const levelEff = Math.min(1, filled / req);
                    reducedEfficiencyDueToWorkers = Math.min(reducedEfficiencyDueToWorkers, levelEff);
                }

                const resourceEfficiencies = facility.needs.map((need) => {
                    const requiredAmount = need.quantity * facility.scale;

                    // land-bound resources (e.g. arable land, water sources) are not stored in storage
                    // facilities. They live on the planet as resource claims and must be queried/extracted directly from there (and only if this agent is the tenant of the claim, i.e. currently using it).
                    if (need.resource.type === 'landBoundResource') {
                        const total = queryClaimedResource(planet, agent, need.resource);
                        return Math.min(1, total / requiredAmount);
                    }

                    // default: query from storage facility
                    const available = queryStorageFacility(assets.storageFacility, need.resource.name);
                    return Math.min(1, available / requiredAmount);
                });

                const overallEfficiency = Math.min(reducedEfficiencyDueToWorkers, ...resourceEfficiencies);
                facility.lastTickEfficiencyInPercent = Math.round(overallEfficiency * 100);

                // Record overqualified worker usage for decision-making
                const overqualifiedRecord: { [edu in EducationLevelType]?: number } = {};
                for (const edu of educationLevelKeys) {
                    if (workerAllocation[edu].overqualified > 0) {
                        overqualifiedRecord[edu] = workerAllocation[edu].overqualified;
                    }
                }
                facility.lastTickOverqualifiedWorkers =
                    Object.keys(overqualifiedRecord).length > 0 ? overqualifiedRecord : undefined;

                if (overallEfficiency <= 0) {
                    return; // facility cannot operate, skip
                }

                planet.environment.pollution.air += facility.pollutionPerTick.air * facility.scale * overallEfficiency;
                planet.environment.pollution.water +=
                    facility.pollutionPerTick.water * facility.scale * overallEfficiency;
                planet.environment.pollution.soil +=
                    facility.pollutionPerTick.soil * facility.scale * overallEfficiency;

                // Produce outputs scaled by overall efficiency
                facility.produces.forEach((output) => {
                    const producedAmount = Math.floor(output.quantity * facility.scale * overallEfficiency);
                    if (producedAmount <= 0) {
                        return; // nothing produced, skip
                    }
                    putIntoStorageFacility(assets.storageFacility, output.resource, producedAmount);
                });

                // Consume inputs scaled by overall efficiency. For land-bound resources we
                // remove from the planet's resource claim (only if this agent is the tenant).
                facility.needs.forEach((need) => {
                    const consumedAmount = Math.ceil(need.quantity * facility.scale * overallEfficiency);

                    if (need.resource.type === 'landBoundResource') {
                        const extractedAmount = extractFromClaimedResource(
                            planet,
                            agent,
                            need.resource,
                            consumedAmount,
                        );
                        if (extractedAmount < consumedAmount) {
                            console.warn(
                                `Unexpected: extracted ${extractedAmount} from land-bound resource ${need.resource.name} but expected to consume ${consumedAmount}. This should not happen since efficiency is scaled based on available quantity.`,
                                {
                                    planetId: planet.id,
                                    agentId: agent.id,
                                    facilityId: facility.id,
                                    needResource: need.resource.name,
                                },
                            );
                        }
                    } else {
                        const removedAmount = removeFromStorageFacility(
                            assets.storageFacility,
                            need.resource.name,
                            consumedAmount,
                        );
                        if (removedAmount < consumedAmount) {
                            console.warn(
                                `Unexpected: removed ${removedAmount} from storage for resource ${need.resource.name} but expected to consume ${consumedAmount}. This should not happen since efficiency is scaled based on available quantity.`,
                                {
                                    planetId: planet.id,
                                    agentId: agent.id,
                                    facilityId: facility.id,
                                    needResource: need.resource.name,
                                },
                            );
                        }
                    }
                });

                // Deduct workers actually used (scaled by efficiency) from remainingWorker.
                // Walk the same downhill path to deduct from the correct education pools.
                for (const [eduLevel, req] of Object.entries(facility.workerRequirement)) {
                    if (!req || req <= 0) {
                        continue;
                    }
                    const jobEdu = eduLevel as EducationLevelType;
                    const jobEduIdx = educationLevelKeys.indexOf(jobEdu);
                    let toDeduct = Math.floor(req * facility.scale * overallEfficiency);

                    for (let i = jobEduIdx; i < educationLevelKeys.length && toDeduct > 0; i++) {
                        const candidateEdu = educationLevelKeys[i];
                        const available = remainingWorker[candidateEdu] || 0;
                        const take = Math.min(toDeduct, available);
                        if (take > 0) {
                            remainingWorker[candidateEdu] -= take;
                            toDeduct -= take;
                        }
                    }
                }
            });
        });
    });
}

export function environmentTick(gameState: GameState) {
    gameState.planets.forEach((planet) => {
        // Apply natural regeneration to pollution indices (decrease pollution by regenerationRates)
        planet.environment.pollution.air = Math.max(
            0,
            planet.environment.pollution.air -
                planet.environment.regenerationRates.air.constant -
                planet.environment.pollution.air * planet.environment.regenerationRates.air.percentage,
        );
        planet.environment.pollution.water = Math.max(
            0,
            planet.environment.pollution.water -
                planet.environment.regenerationRates.water.constant -
                planet.environment.pollution.water * planet.environment.regenerationRates.water.percentage,
        );
        planet.environment.pollution.soil = Math.max(
            0,
            planet.environment.pollution.soil -
                planet.environment.regenerationRates.soil.constant -
                planet.environment.pollution.soil * planet.environment.regenerationRates.soil.percentage,
        );

        regenerateRenewableResources(planet);
    });
}

const startFertileAge = 18;
const endFertileAge = 45;

const calculateDemographicStats = (population: Population) => {
    let populationTotal = 0;
    let fertileWomen = 0;
    const totalInCohort: number[] = population.demography.map((cohort, age) => {
        const cohortTotal = sumCohort(cohort);
        if (age >= startFertileAge && age <= endFertileAge) {
            fertileWomen += cohortTotal * 0.5;
        }
        populationTotal += cohortTotal;
        return cohortTotal;
    });
    return { populationTotal, fertileWomen, totalInCohort };
};

export function populationTick(gameState: GameState) {
    gameState.planets.forEach((planet) => {
        // Create a new planet object but ensure nested environment is cloned so
        // updates below (pollution regeneration) don't mutate the original planet.

        const { population } = planet;

        const { populationTotal, fertileWomen, totalInCohort } = calculateDemographicStats(population);

        if (populationTotal === 0) {
            return; // no population, skip
        }

        // --- Food consumption and nutritional effects ---
        // FOOD_PER_PERSON_PER_TICK is already per-tick; compute per-tick demand
        const perTickFoodDemand = populationTotal * FOOD_PER_PERSON_PER_TICK;

        const availableFood = Math.max(
            1.2 * perTickFoodDemand,
            queryStorageFacility(
                planet.government.assets[planet.id]?.storageFacility,
                agriculturalProductResourceType.name,
            ),
        );

        const foodConsumed = removeFromStorageFacility(
            planet.government.assets[planet.id]?.storageFacility,
            agriculturalProductResourceType.name,
            availableFood,
        );
        // Precompute environment and fertility variables used below
        const { pollution, naturalDisasters } = planet.environment;
        const nutritionalFactor = foodConsumed / perTickFoodDemand;

        // Compute annual environmental mortality & disability contributions
        const pollutionMortalityRate = pollution.air * 0.006 + pollution.water * 0.00002 + pollution.soil * 0.00001;
        const disasterDeathProbability =
            naturalDisasters.earthquakes * 0.0005 +
            naturalDisasters.floods * 0.00005 +
            naturalDisasters.storms * 0.000015;

        const STARVATION_FULL_DURATION_TICKS = 30; // ~2 month to reach full starvation
        const RECOVERY_DURATION_TICKS = 30; // ~2 months to recover
        const MAX_MORTALITY = 0.95; // cap total mortality (including starvation) to 95% per tick to avoid complete wipeouts in one tick
        const STARVATION_MAX_LEVEL = 1; // at starvationLevel 0.5, we apply the full additional mortality from starvation (which can be up to ~50% at max starvation level, scaled by age for sacrifice). This allows for a more gradual increase in mortality as starvation worsens, while still allowing for very high mortality at extreme starvation levels.

        // Increase proportional to the shortfall (1 - nutritionalFactor). If nutritionalFactor == 0
        // we add 1/STARVATION_FULL_DURATION_TICKS per tick, reaching 1 in STARVATION_FULL_DURATION_TICKS ticks.
        const shortfall = Math.max(0, 1 - Math.min(1, nutritionalFactor));
        const perTickStarvationIncrease = shortfall * (1 / STARVATION_FULL_DURATION_TICKS);

        // Recovery scales with nutritionalFactor (if fully fed, recover at full recovery rate).
        const perTickRecovery =
            shortfall !== 0
                ? 0
                : Math.min(population.starvationLevel, Math.max(0, nutritionalFactor) * (1 / RECOVERY_DURATION_TICKS));

        population.starvationLevel = Math.max(
            0,
            Math.min(STARVATION_MAX_LEVEL, population.starvationLevel + perTickStarvationIncrease - perTickRecovery),
        );

        // Extra mortality from pollution and disasters remains annual here; starvation mortality will be
        // applied directly on a per-tick basis (so that starvation can lead to rapid deaths once severe).
        const extraMortalityPerYear = pollutionMortalityRate + disasterDeathProbability;

        const pollutionDisabilityProb = Math.min(
            0.5,
            pollution.air * 0.0001 + pollution.water * 0.0001 + pollution.soil * 0.00002,
        );
        const disasterDisabilityProb = Math.min(
            0.3,
            naturalDisasters.earthquakes * 0.00005 +
                naturalDisasters.floods * 0.000005 +
                naturalDisasters.storms * 0.0000015,
        );

        // Apply mortality & disability per tick to each age cohort (in-place).
        for (let age = maxAge; age >= 0; age--) {
            const cohort = population.demography[age];
            if (!cohort) {
                continue;
            }
            const total = totalInCohort[age];
            if (total === 0) {
                continue;
            }

            const baseAnnualMort = mortalityProbability(age) * (1 + Math.pow(population.starvationLevel, 6) * 99);

            const combinedAnnualMort = Math.min(1, baseAnnualMort + extraMortalityPerYear); // starvation can add up to 50% additional mortality at max starvation level, scaled by age for sacrifice

            // starvationLevel is a per-planet, per-tick index in 0..STARVATION_MAX_LEVEL. We treat it as
            // an additional per-tick mortality factor (so at starvationLevel == STARVATION_MAX_LEVEL up to ~90% can die this tick).
            const totalPerTickMort = Math.min(MAX_MORTALITY, convertAnnualToPerTick(combinedAnnualMort));

            const survivors = Math.floor(total * (1 - totalPerTickMort));

            if (survivors === 0) {
                population.demography[age] = emptyCohort();
                continue;
            }

            const survivorsCohort = distributeLike(survivors, cohort);

            // Apply disability transitions per-tick
            const ageDependentBaseDisabilityProb = (age: number) => {
                // we count retirement as a form of disability for simplicity, so everyone has some baseline disability probability that increases with age
                if (age < 15) {
                    return 0.001; // children have a baseline disability probability (e.g. congenital conditions)
                } else if (age < 50) {
                    return 0.0005; // adults have a lower baseline disability probability
                } else if (age < 60) {
                    return 0.005; // elderly have a higher baseline disability probability
                } else if (age < 65) {
                    return 0.05; // early retirement age, noticeable increase in disability probability
                } else if (age < 70) {
                    return 0.2; // retirement age, significant increase in disability probability
                } else {
                    return 0.5; // very old age, further increase in disability probability
                }
            };
            const totalDisabilityProb =
                pollutionDisabilityProb + disasterDisabilityProb + ageDependentBaseDisabilityProb(age); // start with age 0, we'll apply the age-dependent part per-cohort below
            const perTickDisabilityProb = convertAnnualToPerTick(totalDisabilityProb);
            for (const edu of educationLevelKeys) {
                for (const occ of ['company', 'government', 'education', 'unoccupied'] as Occupation[]) {
                    const occCount = survivorsCohort[edu][occ];
                    const moveFromOcc = Math.floor(occCount * perTickDisabilityProb);
                    if (moveFromOcc > 0) {
                        survivorsCohort[edu][occ] -= moveFromOcc;
                        survivorsCohort[edu].unableToWork += moveFromOcc;
                    }
                }
            }

            population.demography[age] = survivorsCohort;
        }

        // --- Births applied per-tick throughout the year ---
        // Compute births per year from current (post-aging when applicable) demography

        // We use a simplified fertility model
        // This is an effective fertility that must lie over a realistic one as we want to model different
        // influences on fertility by ourselves (e.g. pollution, starvation).
        // We found that a lifetime fertility of around 2.6 = slightly above replacement
        const lifetimeFertility = 2.66; // slightly above replacement to allow for child mortality
        // equivalent of 100 air pollution = 50% reduction (which is also the max reduction we apply to fertility due to pollution)
        const fertReduction = Math.min(1, pollution.air * 0.01 + pollution.water * 0.002 + pollution.soil * 0.0005);

        const lifetimeFertilityAdjusted =
            lifetimeFertility * (1 - 0.5 * population.starvationLevel) * (1 - 0.5 * fertReduction); // partial buffering

        if (fertileWomen === 0) {
            console.log('no fertile women');
        }
        const birthsPerYear = Math.floor(
            (lifetimeFertilityAdjusted * fertileWomen) / (endFertileAge - startFertileAge + 1),
        );

        const birthsThisTick = Math.floor(birthsPerYear / TICKS_PER_YEAR);
        if (birthsThisTick > 0) {
            // add newborns to cohort 0 over the year
            population.demography[0].none.education += birthsThisTick;
        }
    });
}

/**
 * populationAdvanceYearTick — called by advanceTick at every year boundary.
 *
 * Applies aging and education progression to every planet's population.
 */
export function populationAdvanceYearTick(gameState: GameState): void {
    gameState.planets.forEach((planet) => {
        const { totalInCohort } = calculateDemographicStats(planet.population);
        populationAdvanceYear(planet.population, totalInCohort);
    });
}

export const populationAdvanceYear = (population: Population, totalInCohort: number[]) => {
    // We shift cohorts to age+1 and create an empty cohort 0 which will
    // be filled over the year by per-tick births.

    // (fertile-women calculation is performed per-tick below so it's not needed here)
    const newdemography = Array.from({ length: maxAge + 1 }, () => emptyCohort());

    // 1. Aging: shift everyone one year up and apply education/occupation transitions
    for (let age = 0; age < maxAge; age++) {
        const cohort = population.demography[age];

        const total = totalInCohort[age];
        if (!total || total === 0) {
            continue;
        }

        // Apply education progression and occupation transitions (mortality already applied per-tick)
        const nextAgeCohort = emptyCohort();

        for (const edu of educationLevelKeys) {
            for (const occ of OCCUPATIONS) {
                const count = cohort[edu][occ];
                if (count === 0) {
                    continue;
                }

                if (occ === 'education') {
                    const gradProb = educationGraduationProbabilityForAge(age, edu);
                    const graduates = Math.floor(count * gradProb);
                    const stay = count - graduates;

                    const educationLevel = educationLevels[edu];
                    const nextEducation = educationLevel.nextEducation();

                    if (graduates > 0 && nextEducation) {
                        const transitionProbability = educationLevel.transitionProbability;
                        const transitioners = Math.floor(graduates * transitionProbability);
                        const voluntaryDropouts = graduates - transitioners;

                        nextAgeCohort[nextEducation.type][occ] += transitioners;
                        nextAgeCohort[nextEducation.type].unoccupied += voluntaryDropouts;
                    }

                    if (stay > 0) {
                        const dropOutProb = ageDropoutProbabilityForEducation(age, edu);
                        const dropouts = Math.ceil(stay * dropOutProb);
                        const remainers = stay - dropouts;

                        if (age < 6) {
                            // Before age 6, children cannot drop out of education
                            nextAgeCohort[edu][occ] += dropouts;
                        } else {
                            nextAgeCohort[edu].unoccupied += dropouts;
                        }
                        nextAgeCohort[edu][occ] += remainers;
                    }
                } else {
                    nextAgeCohort[edu][occ] += count;
                }
            }
        }

        // Place the processed cohort into the new population at age+1 (if within bounds)
        if (age < maxAge) {
            newdemography[age + 1] = nextAgeCohort;
        }
    }
    population.demography = newdemography;
};
