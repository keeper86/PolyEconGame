import { MAX_WAGE, MIN_WAGE, WAGE_ADJUSTMENT_RATE } from '../constants';
import { creditWageIncome } from '../financial/wealthOps';
import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';
import { ACCEPTABLE_IDLE_FRACTION } from './hireWorkforce';
import { totalActiveForEduSkill } from './workforceAggregates';

function computeExactUsedByEdu(assets: AgentPlanetAssets): Record<EducationLevelType, number> {
    const allFacilities = [
        ...assets.productionFacilities,
        ...assets.managementFacilities,
        assets.storageFacility,
        ...assets.shipConstructionFacilities,
    ];
    const exactUsed: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    for (const facility of allFacilities) {
        const tick = facility.lastTickResults;
        if (!tick) {
            continue;
        }
        for (const edu of educationLevelKeys) {
            exactUsed[edu] += tick.exactUsedByEdu[edu] ?? 0;
        }
    }
    return exactUsed;
}

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

export function automaticWageAdjustment(agents: Map<string, Agent>, planet: Planet): void {
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

        const exactUsed = computeExactUsedByEdu(assets);
        const totalSlotCapacity: Record<EducationLevelType, number> = assets.totalSlotCapacity ?? {
            none: 0,
            primary: 0,
            secondary: 0,
            tertiary: 0,
        };
        const overqualified = assets.overqualifiedWorkers ?? {};

        const last = assets.lastMonthAcc;
        const operationalProfit = last.revenue - last.wages - last.purchases - last.claimPayments;

        const hasLastMonthData = last.revenue !== 0 || last.wages !== 0;
        const isProfitable = hasLastMonthData
            ? operationalProfit > 0
            : assets.deposits - assets.monthAcc.depositsAtMonthStart > 0;

        for (const edu of educationLevelKeys) {
            // How many exact matches are we missing?
            const gap = totalSlotCapacity[edu] - exactUsed[edu];

            // How many higher-tier workers are actively covering this job?
            let substitutesCovering = 0;
            if (overqualified[edu]) {
                for (const count of Object.values(overqualified[edu]!)) {
                    substitutesCovering += count;
                }
            }

            // Are machines actually sitting empty?
            const idleSlots = gap - Math.floor(substitutesCovering);

            let factor: number;
            if (isProfitable && idleSlots > 0) {
                // True Emergency: Leaving money on the table because machines are empty.
                factor = 1 + WAGE_ADJUSTMENT_RATE;
            } else if (isProfitable && gap > 0) {
                // Inefficient: Machines are running via substitutes, but payroll is bloated.
                // Nudge the wage up gently to attract the exact match.
                factor = 1 + WAGE_ADJUSTMENT_RATE * 0.25;
            } else if (isProfitable && gap <= 0) {
                // Optimized: We have the exact workers we need. Slowly lower wages.
                factor = 1 - WAGE_ADJUSTMENT_RATE * 0.25;
            } else if (!isProfitable && idleSlots > 0) {
                // Unprofitable but missing bodies: Hold or lower slightly.
                factor = 1 - WAGE_ADJUSTMENT_RATE * 0.5;
            } else {
                // Unprofitable and fully staffed/substituted: Bleeding cash, cut payroll heavily.
                factor = 1 - WAGE_ADJUSTMENT_RATE * 2;
            }

            assets.wagePerEdu[edu] = Math.max(MIN_WAGE, Math.min(MAX_WAGE, assets.wagePerEdu[edu] * factor));
        }

        // --- Enforce Monotonicity
        for (let i = 0; i < educationLevelKeys.length - 1; i++) {
            const currentEdu = educationLevelKeys[i];
            const nextEdu = educationLevelKeys[i + 1];

            if (assets.wagePerEdu[currentEdu] > assets.wagePerEdu[nextEdu]) {
                assets.wagePerEdu[currentEdu] = assets.wagePerEdu[nextEdu];
            }
        }

        if (agent.automated) {
            const netBalance =
                assets.deposits - assets.activeLoans.reduce((sum, loan) => sum + loan.remainingPrincipal, 0);
            const reservationCapital = computeReservationCapital(assets);
            const excessCash = netBalance - reservationCapital;

            if (excessCash > 0) {
                let totalWorkers = 0;
                for (const edu of educationLevelKeys) {
                    for (const skill of SKILL) {
                        totalWorkers += totalActiveForEduSkill(workforce, edu, skill);
                    }
                }

                let totalCredit = 0;
                if (totalWorkers > 0) {
                    const perWorkerBonus = excessCash / totalWorkers;
                    for (let age = 0; age < workforce.length; age++) {
                        const ageCohort = workforce[age];
                        if (!ageCohort) {
                            continue;
                        }
                        for (const edu of educationLevelKeys) {
                            for (const skill of SKILL) {
                                const agentWorkers = ageCohort[edu]?.[skill];
                                if (!agentWorkers) {
                                    continue;
                                }
                                const activeWorkers = agentWorkers.active;
                                if (activeWorkers <= 0) {
                                    continue;
                                }
                                const cat = demography[age].employed[edu][skill];
                                if (cat.total <= 0) {
                                    // cat should be populated if agent has active workers there
                                    continue;
                                }

                                totalCredit += creditWageIncome(bank, cat, perWorkerBonus, activeWorkers);
                            }
                        }
                    }

                    if (Math.abs(totalCredit - excessCash) / excessCash > 1e-6) {
                        console.error(
                            `[automaticWageAdjustment] profit-sharing accounting mismatch: ` +
                                `excessCash=${excessCash.toFixed(4)}, ` +
                                `totalCredit=${totalCredit.toFixed(4)}, ` +
                                `diff=${(totalCredit - excessCash).toFixed(6)}`,
                        );
                    }
                }

                assets.monthAcc.profitShareBonuses += totalCredit;
                assets.deposits -= totalCredit;
            }
        }
    }
}
