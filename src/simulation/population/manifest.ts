import {
    EDUCATION_BUFFER_TARGET_TICKS,
    GROCERY_BUFFER_TARGET_TICKS,
    HEALTHCARE_BUFFER_TARGET_TICKS,
    SERVICE_PER_PERSON_PER_TICK
} from '../constants';
import type { Agent, Planet } from '../planet/planet';
import { educationLevelKeys, type EducationLevelType } from '../population/education';
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
import type { Provision } from '../ships/ships';

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

                // Remove from agent workforce
                workforce.active -= take;

                // Remove from planet demography
                planetCell.total -= take;
                planet.population.summedPopulation.employed[edu][skill].total -= take;
                if (planetCell.total === 0) {
                    planetCell.wealth = { mean: 0, variance: 0 };
                }

                // Add to manifest
                const key = manifestKey(age, 'employed', edu, skill);
                mergeIntoManifest(manifest, key, planetCell, take);

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

export function advanceManifestAge(manifest: PassengerManifest, travelYears: number): PassengerManifest {
    if (travelYears <= 0) {
        return { ...manifest };
    }

    const fullYears = Math.floor(travelYears);
    const frac = travelYears - fullYears;

    const result: PassengerManifest = {};

    for (const [key, category] of Object.entries(manifest)) {
        if (category.total <= 0) {
            continue;
        }

        const idx = parseManifestKey(key);
        const baseAge = Math.min(idx.age + fullYears, MAX_AGE);

        if (frac <= 0) {
            const newKey = manifestKey(baseAge, idx.occ, idx.edu, idx.skill);
            mergeIntoManifest(result, newKey, category, category.total);
        } else {
            const advanceAge = Math.min(baseAge + 1, MAX_AGE);

            if (advanceAge === baseAge) {
                // Already at MAX_AGE — all people clamp here
                const newKey = manifestKey(baseAge, idx.occ, idx.edu, idx.skill);
                mergeIntoManifest(result, newKey, category, category.total);
            } else {
                const countStay = category.total * (1 - frac);
                const countAdvance = category.total * frac;

                if (countStay > 0) {
                    const stayKey = manifestKey(baseAge, idx.occ, idx.edu, idx.skill);
                    mergeIntoManifest(result, stayKey, category, countStay);
                }
                if (countAdvance > 0) {
                    const advKey = manifestKey(advanceAge, idx.occ, idx.edu, idx.skill);
                    mergeIntoManifest(result, advKey, category, countAdvance);
                }
            }
        }
    }

    return result;
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
