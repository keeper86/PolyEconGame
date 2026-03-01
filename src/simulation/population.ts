import { FOOD_PER_PERSON_PER_TICK, TICKS_PER_YEAR } from './constants';
import { agriculturalProductResourceType, queryStorageFacility, removeFromStorageFacility } from './facilities';
import { applyPopulationDeathsToWorkforce } from './workforce';
import type { EducationLevelType, Occupation, Population, GameState } from './planet';
import { educationLevelKeys, educationLevels, maxAge, OCCUPATIONS } from './planet';
import {
    ageDropoutProbabilityForEducation,
    distributeLike,
    educationGraduationProbabilityForAge,
    emptyCohort,
    mortalityProbability,
    sumCohort,
} from './populationHelpers';

// Convert annual rates to per-tick equivalents to smooth mortality over ticks
const convertAnnualToPerTick = (annualRate: number) => {
    if (annualRate >= 1) {
        return 1;
    }
    return 1 - Math.pow(1 - annualRate, 1 / TICKS_PER_YEAR);
};

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
        const extraMortalityPerYear =
            pollutionMortalityRate + disasterDeathProbability + Math.pow(population.starvationLevel, 4);

        // We'll compute population-level deaths below (per age cohort) and
        // apply them deterministically to workforce demography so both
        // representations remain in sync.  (See applyPopulationDeathsToWorkforce.)

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

        // Prepare an accumulator of authoritative deaths per education × occupation
        // that will later be applied to the workforce representation.
        const deathsByEduOcc: Record<EducationLevelType, Record<Occupation, number>> = {} as Record<
            EducationLevelType,
            Record<Occupation, number>
        >;
        for (const edu of educationLevelKeys) {
            deathsByEduOcc[edu] = {} as Record<Occupation, number>;
            for (const occ of OCCUPATIONS) {
                deathsByEduOcc[edu][occ] = 0;
            }
        }

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

            const baseAnnualMort = mortalityProbability(age) * (1 + Math.pow(population.starvationLevel, 4) * 99);
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
                // Genuine disability probability by age — retirement is now handled
                // explicitly by the workforce retirement pipeline, so this only
                // captures real medical/occupational disability transitions.
                if (age < 15) {
                    return 0.001; // children: baseline (congenital conditions)
                } else if (age < 50) {
                    return 0.0005; // working-age adults: low baseline
                } else if (age < 60) {
                    return 0.005; // 50–59: slight increase
                } else if (age < 70) {
                    return 0.01; // 60–69: moderate genuine disability
                } else if (age <= 90) {
                    // 70–90: linear ramp from 0.01 to 0.33
                    return 0.01 + ((age - 70) / 20) * (0.33 - 0.01);
                } else {
                    return 0.33; // 90+: cap at 0.33
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

            // Record deaths (cohort - survivorsCohort) into the accumulator so
            // the workforce can be updated deterministically below.
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    const before = cohort[edu][occ] ?? 0;
                    const after = survivorsCohort[edu][occ] ?? 0;
                    const dead = Math.max(0, before - after);
                    deathsByEduOcc[edu][occ] += dead;
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
        // Apply the authoritative population death tallies to agents' workforce
        // representation.  This ensures exact consistency between population
        // cohorts and workforce counts and avoids rounding drift.
        applyPopulationDeathsToWorkforce(gameState.agents, planet.id, deathsByEduOcc);
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
