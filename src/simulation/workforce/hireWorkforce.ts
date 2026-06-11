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
import { totalWorkingForEdu } from './workforceAggregates';

export const ACCEPTABLE_IDLE_FRACTION = 0.05;

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

            for (const edu of educationLevelKeys) {
                const target = assets.allocatedWorkers[edu] ?? 0;
                const currentActive = totalWorkingForEdu(workforce, edu);

                const gap = target - currentActive;

                if (gap > 0) {
                    // --- HIRING with reservation wage filtering ---
                    const wage = assets.wagePerEdu[edu] ?? 0;

                    // Collect eligible buckets: (age, skill, available count)
                    type Bucket = { age: number; skill: Skill; avail: number; probToAccept: number };
                    const buckets: Bucket[] = [];
                    let totalWilling = 0;

                    const demography = planet.population.demography;
                    for (let age = MIN_EMPLOYABLE_AGE; age < workforce.length; age++) {
                        for (const skill of SKILL) {
                            const avail = demography[age].unoccupied[edu][skill].total;
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
                    // --- FIRING (unchanged from hireWorkforce) ---
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
    return 1 + (age - 25) / 100; // starts at 0.8 at age 25, increases by 0.01 per year
};

const buildCurrentMinimumWageMap = (planet: Planet): ((category: WorkforceCategoryIndex) => number) => {
    // this is the absolute minimum for every worker (himself and half of dependents -> working poor)
    const costOfLiving = computeCostOfLiving(planet.marketPrices) * 2;
    // this covers all available services for 10 dependents
    const costOfLivingRich = computeCostOfLiving(planet.marketPrices, true) * 10;

    return (category: WorkforceCategoryIndex): number => {
        const baseWage = costOfLiving * skillMultiplier[category.skill] * ageMultiplier(category.age);
        // We want to ensure that the wage is at least enough to cover the cost of living, even for the poorest workers.
        // For richer workers, we want to ensure that the wage is at least enough to cover the cost of living with services.
        const requiredWage = Math.max(costOfLiving, baseWage);
        // The maximum reservation wage is based on the cost of living for a rich household
        const requiredWageRich = Math.max(costOfLivingRich, baseWage) * 5;

        const qualificationFactor =
            0.5 *
            ((educationLevelKeys.indexOf(category.edu) + 1) / educationLevelKeys.length +
                (SKILL.indexOf(category.skill) + 1) / SKILL.length);

        return requiredWage + qualificationFactor * (requiredWageRich - requiredWage);
    };
};
