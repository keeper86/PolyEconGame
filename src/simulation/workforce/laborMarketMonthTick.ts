import { NOTICE_PERIOD_MONTHS } from '../constants';
import type { Agent, PerEducation, Planet } from '../planet/planet';
import { educationLevelKeys } from '../population/education';
import { transferPopulation } from '../population/population';
import { assertPopulationWorkforceConsistency } from '../utils/testHelper';
import { forEachWorkforceCohort, subtractProportionalXP, totalWorkersInCategory } from './workforce';

export function postProductionLaborMarketTick(agents: Map<string, Agent>, planet: Planet): void {
    for (const agent of agents.values()) {
        for (const [_planetId, assets] of Object.entries(agent.assets)) {
            const workforce = assets.workforceDemography;
            if (!workforce) {
                continue;
            }

            const fresh = (): PerEducation => {
                const r = {} as PerEducation;
                for (const e of educationLevelKeys) {
                    r[e] = 0;
                }
                return r;
            };

            if (!assets.deaths) {
                assets.deaths = { thisMonth: fresh(), prevMonth: fresh() };
            }
            assets.deaths.prevMonth = assets.deaths.thisMonth;
            assets.deaths.thisMonth = fresh();

            if (!assets.disabilities) {
                assets.disabilities = { thisMonth: fresh(), prevMonth: fresh() };
            }
            assets.disabilities.prevMonth = assets.disabilities.thisMonth;
            assets.disabilities.thisMonth = fresh();
        }
    }

    for (const agent of agents.values()) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
            const workforce = assets.workforceDemography;
            if (!workforce) {
                continue;
            }

            if (planetId !== planet.id) {
                continue;
            }

            if (planet) {
                for (let age = 0; age < workforce.length; age++) {
                    forEachWorkforceCohort(workforce[age], (category, edu, skill) => {
                        const departingAtAge = category.voluntaryDeparting[0];
                        const firedAtAge = category.departingFired[0];
                        const retiredAtAge = category.departingRetired[0];

                        if (departingAtAge + firedAtAge > 0) {
                            const totalBeforeVoluntaryFired = totalWorkersInCategory(category);
                            subtractProportionalXP(category, departingAtAge + firedAtAge, totalBeforeVoluntaryFired);

                            const moved = transferPopulation(
                                planet,
                                { age, occ: 'employed', edu, skill },
                                { age, occ: 'unoccupied', edu, skill },
                                departingAtAge + firedAtAge,
                            ).count;

                            if (moved !== departingAtAge + firedAtAge) {
                                console.warn(
                                    `[postProductionLaborMarketTick] departing mismatch for edu=${edu} age=${age} on agent=${agent.id}: requested=${departingAtAge + firedAtAge}, moved=${moved}`,
                                );
                            }
                        }

                        if (retiredAtAge > 0) {
                            const totalBeforeRetired = totalWorkersInCategory(category);
                            subtractProportionalXP(category, retiredAtAge, totalBeforeRetired);

                            const moved = transferPopulation(
                                planet,
                                { age, occ: 'employed', edu, skill },
                                { age, occ: 'unableToWork', edu, skill },
                                retiredAtAge,
                            ).count;

                            if (moved !== retiredAtAge) {
                                console.warn(
                                    `[postProductionLaborMarketTick] retired departing mismatch for edu=${edu} age=${age} on agent=${agent.id}: requested=${retiredAtAge}, moved=${moved}`,
                                );
                            }
                        }
                    });
                }
            }

            for (let age = 0; age < workforce.length; age++) {
                forEachWorkforceCohort(workforce[age], (category) => {
                    // Promote onboarding graduates to active
                    const onboardingComplete = category.onboarding[0];
                    if (onboardingComplete > 0) {
                        category.active += onboardingComplete;
                    }

                    for (let i = 0; i < NOTICE_PERIOD_MONTHS - 1; i++) {
                        category.voluntaryDeparting[i] = category.voluntaryDeparting[i + 1] ?? 0;
                        category.departingFired[i] = category.departingFired[i + 1] ?? 0;
                        category.departingRetired[i] = category.departingRetired[i + 1] ?? 0;
                        category.onboarding[i] = category.onboarding[i + 1] ?? 0;
                    }
                    category.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1] = 0;
                    category.departingFired[NOTICE_PERIOD_MONTHS - 1] = 0;
                    category.departingRetired[NOTICE_PERIOD_MONTHS - 1] = 0;
                    category.onboarding[NOTICE_PERIOD_MONTHS - 1] = 0;
                });
            }
        }
    }

    if (process.env.SIM_DEBUG === '1') {
        assertPopulationWorkforceConsistency(agents, planet, 'postProductionLaborMarketTick');
    }
}