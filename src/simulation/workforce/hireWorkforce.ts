import assert from 'node:assert';
import { MIN_EMPLOYABLE_AGE, NOTICE_PERIOD_MONTHS } from '../constants';
import { computeCostOfLiving } from '../market/serviceDefinitions';
import type { Agent, Planet } from '../planet/planet';
import { hasActiveLicense } from '../planet/planet';
import { educationLevelKeys } from '../population/education';
import { SKILL, transferPopulation, type Skill } from '../population/population';
import { distributeProportionally } from '../utils/distributeProportionally';
import { assertPopulationWorkforceConsistency } from '../utils/testHelper';
import type { WorkforceCategoryIndex, WorkforceCohort } from './workforce';
import { nullWorkforceCohortFactory } from './workforce';

export const ACCEPTABLE_IDLE_FRACTION = 0.05;

/** Inlined version of totalWorkingForEdu for a single education level — avoids closure allocations. */
function countWorkersForEdu(workforce: WorkforceCohort<WorkforceCategory>[], edu: string): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        const sk = workforce[age][edu as keyof typeof workforce[0]];
        if (!sk) continue;
        const novice = sk['novice' as Skill];
        total += novice.active + novice.onboarding[0] + novice.onboarding[1] + novice.onboarding[2];
        const prof = sk['professional' as Skill];
        total += prof.active + prof.onboarding[0] + prof.onboarding[1] + prof.onboarding[2];
        const expert = sk['expert' as Skill];
        total += expert.active + expert.onboarding[0] + expert.onboarding[1] + expert.onboarding[2];
    }
    return total;
}

export function hireWorkforce(agents: Map<string, Agent>, planet: Planet): void {
    const minimumWageMap = buildCurrentMinimumWageMap(planet);
    for (const agent of agents.values()) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
            if (planetId !== planet.id) {
                continue;
            }
            if (!hasActiveLicense(assets, 'workforce')) {
                continue;
            }
            const workforce = assets.workforceDemography;
            if (!workforce) {
                continue;
            }

            // Pre-fetch demography and market prices for the bucket loop
            const demography = planet.population.demography;

            for (const edu of educationLevelKeys) {
                const target = assets.allocatedWorkers[edu] ?? 0;
                const currentActive = countWorkersForEdu(workforce, edu);

                const gap = target - currentActive;

                if (gap > 0) {
                    // --- HIRING ---
                    const wage = assets.wagePerEdu[edu] ?? 0;

                    type Bucket = { age: number; skill: Skill; avail: number; probToAccept: number };
                    const buckets: Bucket[] = [];
                    let totalWilling = 0;

                    for (let age = MIN_EMPLOYABLE_AGE; age < workforce.length; age++) {
                        const unocc = demography[age].unoccupied[edu];
                        if (!unocc) continue;
                        for (const skill of SKILL) {
                            const avail = unocc[skill].total;
                            if (avail <= 0) {
                                continue;
                            }

                            const reservationWage = minimumWageMap({ age, edu, skill });
                            assert(reservationWage > 0, `reservationWage must be > 0, got ${reservationWage}`);

                            const probToAccept = (1.0 / (1 + Math.exp(-(wage / reservationWage - 1)))) * 0.05;
                            buckets.push({ age, skill, avail, probToAccept });
                            totalWilling += avail * probToAccept;
                        }
                    }

                    const toHire = Math.floor(Math.min(gap, totalWilling));
                    if (toHire > 0) {
                        const allocatedBuckets = distributeProportionally(
                            toHire,
                            buckets.map((b) => b.avail * b.probToAccept),
                        );

                        for (let i = 0; i < buckets.length; i++) {
                            const { age, skill } = buckets[i];
                            const actual = allocatedBuckets[i];
                            if (actual > 0) {
                                transferPopulation(
                                    planet,
                                    { age, occ: 'unoccupied', edu, skill },
                                    { age, occ: 'employed', edu, skill },
                                    actual,
                                );

                                workforce[age][edu][skill].onboarding[NOTICE_PERIOD_MONTHS - 1] += actual;
                            }
                        }
                    }
                } else if (gap < -currentActive * ACCEPTABLE_IDLE_FRACTION) {
                    // --- FIRING ---
                    let toFire = -gap;

                    for (let age = 0; age < workforce.length && toFire > 0; age++) {
                        for (const skill of SKILL) {
                            if (toFire <= 0) {
                                break;
                            }
                            const cat = workforce[age][edu][skill];
                            const fire = Math.min(toFire, cat.active);
                            if (fire > 0) {
                                cat.active -= fire;
                                cat.departingFired[NOTICE_PERIOD_MONTHS - 1] += fire;
                                toFire -= fire;
                            }
                        }
                    }
                }
            }
        }
    }

    if (process.env.SIM_DEBUG === '1') {
        assertPopulationWorkforceConsistency(agents, planet, 'performLaborMatching');
    }
}

export const nullWageMapFactory = (): WorkforceCohort<number> => nullWorkforceCohortFactory(() => 0);

export const skillMultiplier: Record<Skill, number> = {
    novice: 0.7,
    professional: 1.0,
    expert: 1.3,
};

const ageMultiplier: (age: number) => number = (age) => {
    return 1 + (age - 25) / 100;
};

const buildCurrentMinimumWageMap = (planet: Planet): ((category: WorkforceCategoryIndex) => number) => {
    const costOfLiving = computeCostOfLiving(planet.marketPrices) * 2;
    const costOfLivingRich = computeCostOfLiving(planet.marketPrices, true) * 10;

    return (category: WorkforceCategoryIndex): number => {
        const baseWage = costOfLiving * skillMultiplier[category.skill] * ageMultiplier(category.age);
        const requiredWage = Math.max(costOfLiving, baseWage);
        const requiredWageRich = Math.max(costOfLivingRich, baseWage) * 5;

        const qualificationFactor =
            0.5 *
            ((educationLevelKeys.indexOf(category.edu) + 1) / educationLevelKeys.length +
                (SKILL.indexOf(category.skill) + 1) / SKILL.length);

        return requiredWage + qualificationFactor * (requiredWageRich - requiredWage);
    };
};