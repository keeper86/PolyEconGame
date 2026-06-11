import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';
import { MIN_WAGE, WAGE_ADJUSTMENT_RATE } from '../constants';
import { ACCEPTABLE_IDLE_FRACTION } from './hireWorkforce';
import { totalDepartingForEdu, totalWorkingForEdu } from './workforceAggregates';
import { creditWageIncome } from '../financial/wealthOps';

export function automaticWorkerAllocation(agents: Map<string, Agent>, planet: Planet): void {
    for (const agent of agents.values()) {
        if (!agent.automated && !agent.automateWorkerAllocation) {
            continue;
        }
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }

        const allFacilities = [
            ...assets.productionFacilities,
            ...assets.managementFacilities,
            assets.storageFacility,
            ...assets.shipConstructionFacilities,
        ];

        const totalSlotCapacity: Record<EducationLevelType, number> = assets.totalSlotCapacity ?? {
            none: 0,
            primary: 0,
            secondary: 0,
            tertiary: 0,
        };

        const totalUsed: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
        const exactUsed: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };

        for (const facility of allFacilities) {
            const tick = facility.lastTickResults;
            if (!tick) {
                continue;
            }
            for (const edu of educationLevelKeys) {
                totalUsed[edu] += tick.totalUsedByEdu[edu] ?? 0;
                exactUsed[edu] += tick.exactUsedByEdu[edu] ?? 0;
            }
        }

        const newTarget: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
        for (const edu of educationLevelKeys) {
            const deficit = Math.max(0, totalSlotCapacity[edu] - exactUsed[edu]);

            let target = totalUsed[edu] + deficit;
            target = Math.ceil(target * (1 + ACCEPTABLE_IDLE_FRACTION));
            newTarget[edu] = target;
        }

        assets.allocatedWorkers = newTarget;
    }
}

function computeReservationCapital(assets: AgentPlanetAssets): number {
    const lastMonthWages = assets.lastMonthAcc.wages ?? 0;
    const lastMonthPurchases = assets.lastMonthAcc.purchases ?? 0;
    const monthlyRunRate = lastMonthWages + lastMonthPurchases;
    // If we have no last month data yet, fall back to current month (which may still be incomplete)
    const effectiveMonthlyRunRate = monthlyRunRate > 0 ? monthlyRunRate : Number.MAX_SAFE_INTEGER;
    return effectiveMonthlyRunRate * 12; // 1 year of operating costs
}

export function automaticProfitDistribution(agents: Map<string, Agent>, planet: Planet): void {
    const bank = planet.bank;
    const demography = planet.population.demography;

    for (const agent of agents.values()) {
        if (!agent.automated && !agent.automateWorkerAllocation) {
            continue;
        }
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }
        const workforce = assets.workforceDemography;
        if (!workforce) {
            continue;
        }

        const profitDelta = assets.deposits - assets.monthAcc.depositsAtMonthStart;
        const netBalance = assets.deposits - assets.activeLoans.reduce((sum, loan) => sum + loan.remainingPrincipal, 0);

        const reservationCapital = computeReservationCapital(assets);
        if (profitDelta < 0) {
            // Loss case: reduce wages to stay competitive
            for (const edu of educationLevelKeys) {
                assets.wagePerEdu[edu] = Math.max(MIN_WAGE, assets.wagePerEdu[edu] * (1 - WAGE_ADJUSTMENT_RATE));
            }
        } else {
            // Profit case: compute reservation capital and distribute excess as bonus
            const excessCash = netBalance - reservationCapital;

            if (excessCash > 0) {
                // Distribute directly to workers
                const totalWorkersForEdu: Record<EducationLevelType, number> = {
                    none: 0,
                    primary: 0,
                    secondary: 0,
                    tertiary: 0,
                };
                for (const edu of educationLevelKeys) {
                    const activeWorkers = totalWorkingForEdu(workforce, edu);
                    const departingWorkers = totalDepartingForEdu(workforce, edu);
                    totalWorkersForEdu[edu] = activeWorkers + departingWorkers;
                }

                const totalWorkers = Object.values(totalWorkersForEdu).reduce((s, n) => s + n, 0);
                if (totalWorkers > 0) {
                    const perWorkerBonus = excessCash / totalWorkers;
                    for (let age = 0; age < demography.length; age++) {
                        for (const edu of educationLevelKeys) {
                            for (const skill of SKILL) {
                                const agentWorkers = workforce[age]?.[edu]?.[skill];
                                if (!agentWorkers) {
                                    continue;
                                }
                                const activeWorkers = agentWorkers.active;
                                const onboardingWorkers = agentWorkers.onboarding.reduce((s, n) => s + n, 0);
                                const departingWorkers = agentWorkers.voluntaryDeparting.reduce((s, n) => s + n, 0);
                                const agentWorkersHere = activeWorkers + onboardingWorkers + departingWorkers;
                                if (agentWorkersHere <= 0) {
                                    continue;
                                }
                                const cat = demography[age].employed[edu][skill];
                                if (cat.total <= 0) {
                                    continue;
                                }

                                creditWageIncome(bank, cat, perWorkerBonus, agentWorkersHere);
                            }
                        }
                    }
                }

                assets.monthAcc.profitShareBonuses += excessCash;
                assets.deposits -= excessCash;
            }
        }
    }
}
