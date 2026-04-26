import {
    EDUCATION_BUFFER_TARGET_TICKS,
    GROCERY_BUFFER_TARGET_TICKS,
    HEALTHCARE_BUFFER_TARGET_TICKS,
    SERVICE_PER_PERSON_PER_TICK,
    TICKS_PER_YEAR,
} from '../constants';
import type { Agent, Planet } from '../planet/planet';
import { educationLevelKeys, type EducationLevelType } from '../population/education';
import { ageDependentBaseDisabilityProb } from '../population/disability';
import { mortalityProbability } from '../population/mortality';
import { stochasticRound } from '../utils/stochasticRound';
import {
    MAX_AGE,
    SKILL,
    mergeGaussianMoments,
    nullPopulationCategory,
    type Occupation,
    type PopulationCategory,
    type PopulationCategoryIndex,
    type ServiceName,
    type Skill,
} from '../population/population';
import type { Provision } from './ships';

export type PassengerManifest = Record<string, PopulationCategory>;

export function manifestKey(age: number, occ: Occupation, edu: EducationLevelType, skill: Skill): string {
    return `${age}:${occ}:${edu}:${skill}`;
}

export function parseManifestKey(key: string): PopulationCategoryIndex {
    const [ageStr, occ, edu, skill] = key.split(':');
    return {
        age: parseInt(ageStr, 10),
        occ: occ as Occupation,
        edu: edu as EducationLevelType,
        skill: skill as Skill,
    };
}

function mergeIntoManifest(
    manifest: PassengerManifest,
    key: string,
    sourceCategory: PopulationCategory,
    count: number,
): void {
    const existing = manifest[key];
    if (!existing || existing.total === 0) {
        manifest[key] = {
            ...nullPopulationCategory(),
            total: count,
            wealth: { ...sourceCategory.wealth },
            services: {
                grocery: { ...sourceCategory.services.grocery },
                retail: { ...sourceCategory.services.retail },
                logistics: { ...sourceCategory.services.logistics },
                healthcare: { ...sourceCategory.services.healthcare },
                construction: { ...sourceCategory.services.construction },
                administrative: { ...sourceCategory.services.administrative },
                education: { ...sourceCategory.services.education },
            },
        };
        return;
    }

    const mergedWealth = mergeGaussianMoments(existing.total, existing.wealth, count, sourceCategory.wealth);
    const newTotal = existing.total + count;

    for (const svcName of Object.keys(existing.services) as ServiceName[]) {
        const a = existing.services[svcName];
        const b = sourceCategory.services[svcName];
        existing.services[svcName] = {
            buffer: newTotal > 0 ? (a.buffer * existing.total + b.buffer * count) / newTotal : 0,
            starvationLevel:
                newTotal > 0 ? (a.starvationLevel * existing.total + b.starvationLevel * count) / newTotal : 0,
        };
    }

    existing.total = newTotal;
    existing.wealth = mergedWealth;
}

export function boardPassengersFromWorkforce(
    agent: Agent,
    planet: Planet,
    planetId: string,
    manifest: PassengerManifest,
    targetCount: number,
): number {
    const assets = agent.assets[planetId];
    if (!assets) {
        return 0;
    }

    const workforceDemography = assets.workforceDemography;
    const demography = planet.population.demography;

    let remaining = targetCount;
    let boarded = 0;

    for (let age = 0; age <= MAX_AGE && remaining > 0; age++) {
        const wfCohort = workforceDemography[age];
        const popCohort = demography[age];
        if (!wfCohort || !popCohort) {
            continue;
        }

        for (const edu of educationLevelKeys) {
            if (remaining <= 0) {
                break;
            }
            for (const skill of SKILL) {
                if (remaining <= 0) {
                    break;
                }

                const workforce = wfCohort[edu]?.[skill];
                if (!workforce || workforce.active <= 0) {
                    continue;
                }

                const planetCell = popCohort.employed?.[edu]?.[skill];
                if (!planetCell || planetCell.total <= 0) {
                    continue;
                }

                const take = Math.min(workforce.active, planetCell.total, remaining);
                if (take <= 0) {
                    continue;
                }

                // Snapshot wealth before mutating planetCell — if take exhausts
                // the cohort we zero out planetCell.wealth, but boarded
                // passengers should inherit the original wealth.
                const preMutationWealth = { ...planetCell.wealth };

                // Remove from agent workforce
                workforce.active -= take;

                // Remove from planet demography
                planetCell.total -= take;
                planet.population.summedPopulation.employed[edu][skill].total -= take;
                if (planetCell.total === 0) {
                    planetCell.wealth = { mean: 0, variance: 0 };
                }

                // Add to manifest using the pre-mutation wealth snapshot
                const key = manifestKey(age, 'employed', edu, skill);
                mergeIntoManifest(manifest, key, { ...planetCell, wealth: preMutationWealth }, take);

                boarded += take;
                remaining -= take;
            }
        }
    }

    return boarded;
}

export function calculateProvisions(manifest: PassengerManifest, flightTicks: number): Provision {
    let totalPassengers = 0;
    let educationPassengers = 0;
    for (const [key, cat] of Object.entries(manifest)) {
        if (cat.total <= 0) {
            continue;
        }
        totalPassengers += cat.total;
        const idx = parseManifestKey(key);
        if (idx.occ === 'education') {
            educationPassengers += cat.total;
        }
    }
    const provisionList: Provision = {
        groceryProvisioned: { currently: 0, goal: 0 },
        healthcareProvisioned: { currently: 0, goal: 0 },
        educationProvisioned: { currently: 0, goal: 0 },
    };

    if (totalPassengers === 0) {
        return provisionList;
    }

    const groceryRequired = totalPassengers * SERVICE_PER_PERSON_PER_TICK * (flightTicks + GROCERY_BUFFER_TARGET_TICKS);
    if (groceryRequired > 0) {
        provisionList.groceryProvisioned.goal = groceryRequired;
    }

    const healthcareRequired =
        totalPassengers * SERVICE_PER_PERSON_PER_TICK * (flightTicks + HEALTHCARE_BUFFER_TARGET_TICKS);
    if (healthcareRequired > 0) {
        provisionList.healthcareProvisioned.goal = healthcareRequired;
    }

    if (educationPassengers > 0) {
        const educationRequired =
            educationPassengers * SERVICE_PER_PERSON_PER_TICK * (flightTicks + EDUCATION_BUFFER_TARGET_TICKS);
        if (educationRequired > 0) {
            provisionList.educationProvisioned.goal = educationRequired;
        }
    }

    return provisionList;
}

export function refundBoardedPassengers(
    agent: Agent,
    planet: Planet,
    planetId: string,
    manifest: PassengerManifest,
): void {
    const assets = agent.assets[planetId];

    for (const [key, category] of Object.entries(manifest)) {
        if (category.total <= 0) {
            continue;
        }
        const idx = parseManifestKey(key);

        // Restore agent workforce
        const workforce = assets?.workforceDemography[idx.age]?.[idx.edu]?.[idx.skill];
        if (workforce) {
            workforce.active += category.total;
        }

        // Restore planet demography
        const planetCell = planet.population.demography[idx.age]?.[idx.occ]?.[idx.edu]?.[idx.skill];
        if (planetCell) {
            const mergedWealth = mergeGaussianMoments(
                planetCell.total,
                planetCell.wealth,
                category.total,
                category.wealth,
            );
            const newTotal = planetCell.total + category.total;

            for (const svcName of Object.keys(planetCell.services) as ServiceName[]) {
                const a = planetCell.services[svcName];
                const b = category.services[svcName];
                planetCell.services[svcName] = {
                    buffer: newTotal > 0 ? (a.buffer * planetCell.total + b.buffer * category.total) / newTotal : 0,
                    starvationLevel:
                        newTotal > 0
                            ? (a.starvationLevel * planetCell.total + b.starvationLevel * category.total) / newTotal
                            : 0,
                };
            }

            planetCell.total = newTotal;
            planetCell.wealth = mergedWealth;
            planet.population.summedPopulation[idx.occ][idx.edu][idx.skill].total += category.total;
        }
    }

    // Clear manifest
    for (const key of Object.keys(manifest)) {
        delete manifest[key];
    }
}

export function advanceManifestAge(
    manifest: PassengerManifest,
    departureTick: number,
    flightTicks: number,
): PassengerManifest {
    if (flightTicks <= 0) {
        return { ...manifest };
    }

    const yearsElapsed = flightTicks / TICKS_PER_YEAR;

    // -----------------------------------------------------------------------
    // Phase 1: Mortality — compound per-tick rate over the full flight
    // -----------------------------------------------------------------------
    // Work on a shallow-cloned result so we don't mutate the input.
    const working: PassengerManifest = {};
    for (const [key, category] of Object.entries(manifest)) {
        if (category.total <= 0) {
            continue;
        }
        working[key] = {
            ...nullPopulationCategory(),
            total: category.total,
            wealth: { ...category.wealth },
            services: {
                grocery: { ...category.services.grocery },
                retail: { ...category.services.retail },
                logistics: { ...category.services.logistics },
                healthcare: { ...category.services.healthcare },
                construction: { ...category.services.construction },
                administrative: { ...category.services.administrative },
                education: { ...category.services.education },
            },
        };
    }

    let orphanedWealth = 0;

    for (const [key, category] of Object.entries(working)) {
        const idx = parseManifestKey(key);
        const annualMort = mortalityProbability(idx.age);
        const survivalFactor = Math.pow(1 - annualMort, yearsElapsed);
        const deaths = stochasticRound(category.total * (1 - survivalFactor));
        const newTotal = category.total - deaths;

        if (newTotal > 0) {
            // Redistribute dead wealth to survivors: conservation of total wealth.
            // total_wealth = total * mean  →  new_mean = total_wealth / newTotal
            category.wealth = {
                mean: (category.total * category.wealth.mean) / newTotal,
                variance: category.wealth.variance,
            };
            category.total = newTotal;
        } else {
            // Category entirely wiped out — accumulate orphaned wealth.
            orphanedWealth += category.total * category.wealth.mean;
            category.total = 0;
            category.wealth = { mean: 0, variance: 0 };
        }

        // Starvation: no active consumption in transit, buffers drain but we
        // have no tick-by-tick simulation here. Leave service state as-is;
        // provisions were loaded at departure for exactly flightTicks.
        void deaths; // intentionally unused — could log if desired
    }

    // Redistribute orphaned wealth to a deterministically chosen surviving
    // category (highest total; ties broken by key order) so manifest aging
    // remains reproducible across runs.
    if (orphanedWealth > 0) {
        const survivingKeys = Object.keys(working).filter((k) => working[k]!.total > 0);
        if (survivingKeys.length > 0) {
            const targetKey = survivingKeys.reduce((bestKey, key) => {
                const best = working[bestKey]!;
                const current = working[key]!;
                if (current.total > best.total) {
                    return key;
                }
                if (current.total === best.total && key < bestKey) {
                    return key;
                }
                return bestKey;
            });
            const target = working[targetKey]!;
            // Boost mean of the chosen category.
            target.wealth = {
                mean: target.wealth.mean + orphanedWealth / target.total,
                variance: target.wealth.variance,
            };
        }
        // If no survivors remain, wealth is truly lost (all passengers dead).
    }

    // -----------------------------------------------------------------------
    // Phase 2: Disability — compound per-tick rate, all occ except unableToWork
    // -----------------------------------------------------------------------
    // Iterate over a snapshot of keys because we may add new unableToWork keys.
    for (const key of Object.keys(working)) {
        const category = working[key]!;
        if (category.total <= 0) {
            continue;
        }

        const idx = parseManifestKey(key);
        if (idx.occ === 'unableToWork') {
            continue;
        }

        const annualDisab = ageDependentBaseDisabilityProb(idx.age);
        const disabledFraction = 1 - Math.pow(1 - annualDisab, yearsElapsed);
        const disabledCount = stochasticRound(category.total * disabledFraction);

        if (disabledCount <= 0) {
            continue;
        }

        // Remove from source cohort (wealth mean unchanged — proportional split).
        category.total -= disabledCount;

        // Merge into the unableToWork cohort at the same age/edu/skill.
        const disabledKey = manifestKey(idx.age, 'unableToWork', idx.edu, idx.skill);
        mergeIntoManifest(working, disabledKey, category, disabledCount);
        // Note: mergeIntoManifest uses sourceCategory.wealth for the incoming
        // slice, which still holds the original mean — correct for a proportional split.
    }

    // -----------------------------------------------------------------------
    // Phase 3: Age advancement — discrete, one year per boundary crossed
    // -----------------------------------------------------------------------
    const yearBoundariesCrossed =
        Math.floor((departureTick + flightTicks) / TICKS_PER_YEAR) - Math.floor(departureTick / TICKS_PER_YEAR);

    if (yearBoundariesCrossed <= 0) {
        // No boundaries: remove zero-total entries and return.
        for (const key of Object.keys(working)) {
            if (working[key]!.total <= 0) {
                delete working[key];
            }
        }
        return working;
    }

    const result: PassengerManifest = {};

    // Process keys in descending age order to avoid aliasing when multiple
    // source ages can map to the same target age (including MAX_AGE merging).
    const sortedKeys = Object.keys(working).sort((a, b) => {
        return parseManifestKey(b).age - parseManifestKey(a).age;
    });

    for (const key of sortedKeys) {
        const category = working[key]!;
        if (category.total <= 0) {
            continue;
        }

        const idx = parseManifestKey(key);
        const targetAge = Math.min(idx.age + yearBoundariesCrossed, MAX_AGE);
        const newKey = manifestKey(targetAge, idx.occ, idx.edu, idx.skill);
        mergeIntoManifest(result, newKey, category, category.total);
    }

    return result;
}

export function unloadPassengersToWorkforce(
    agent: Agent,
    planet: Planet,
    planetId: string,
    manifest: PassengerManifest,
): void {
    unloadPassengersToPlanet(planet, manifest);

    const assets = agent.assets[planetId];
    if (!assets) {
        return;
    }
    const workforceDemography = assets.workforceDemography;

    for (const [key, category] of Object.entries(manifest)) {
        if (category.total <= 0) {
            continue;
        }
        const idx = parseManifestKey(key);
        if (idx.occ !== 'employed') {
            continue;
        }
        const age = Math.min(idx.age, MAX_AGE);
        const wfCohort = workforceDemography[age];
        if (!wfCohort) {
            continue;
        }
        const wfCell = wfCohort[idx.edu]?.[idx.skill];
        if (!wfCell) {
            continue;
        }
        wfCell.active += category.total;
    }
}

export function unloadPassengersToPlanet(planet: Planet, manifest: PassengerManifest): void {
    const demography = planet.population.demography;

    for (const [key, category] of Object.entries(manifest)) {
        if (category.total <= 0) {
            continue;
        }

        const idx = parseManifestKey(key);
        const age = Math.min(idx.age, MAX_AGE);

        const planetCell = demography[age]?.[idx.occ]?.[idx.edu]?.[idx.skill];
        if (!planetCell) {
            continue;
        }

        const mergedWealth = mergeGaussianMoments(planetCell.total, planetCell.wealth, category.total, category.wealth);

        planetCell.total += category.total;
        planetCell.wealth = mergedWealth;

        // Set all service buffers to max — full provisions were loaded at departure
        setBuffersToMax(planetCell);

        planet.population.summedPopulation[idx.occ][idx.edu][idx.skill].total += category.total;
    }
}

function setBuffersToMax(category: PopulationCategory): void {
    category.services.grocery = { buffer: GROCERY_BUFFER_TARGET_TICKS, starvationLevel: 0 };
    category.services.healthcare = { buffer: HEALTHCARE_BUFFER_TARGET_TICKS, starvationLevel: 0 };
    category.services.education = { buffer: EDUCATION_BUFFER_TARGET_TICKS, starvationLevel: 0 };
}
