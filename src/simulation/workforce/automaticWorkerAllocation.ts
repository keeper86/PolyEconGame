import { MAX_WAGE, MIN_WAGE, WAGE_ADJUSTMENT_RATE } from '../constants';
import { creditWageIncome } from '../financial/wealthOps';
import type { Facility } from '../planet/facility';
import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { ACCEPTABLE_IDLE_FRACTION } from './laborMarket';
import { totalActiveForEdu } from './workforceAggregates';

function computeExactUsedByEdu(assets: AgentPlanetAssets): Record<EducationLevelType, number> {
    const allFacilities: Array<Facility> = [
        ...assets.productionFacilities,
        ...(assets.storageFacility.department ? [assets.storageFacility.department] : []),
        ...assets.shipConstructionFacilities,
    ];
    if (assets.humanResourcesDepartment) {
        allFacilities.push(assets.humanResourcesDepartment);
    }
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
            ...(assets.humanResourcesDepartment ? [assets.humanResourcesDepartment] : []),
            ...(assets.storageFacility.department ? [assets.storageFacility.department] : []),
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
    const lastClaims = assets.lastMonthAcc.claimPayments ?? 0;
    const monthlyRunRate = lastMonthWages + lastMonthPurchases + lastClaims;
    const effectiveMonthlyRunRate = monthlyRunRate > 0 ? monthlyRunRate : Number.MAX_SAFE_INTEGER;
    return effectiveMonthlyRunRate * 12;
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
            const gap = totalSlotCapacity[edu] - exactUsed[edu];

            let substitutesCovering = 0;
            if (overqualified[edu]) {
                for (const count of Object.values(overqualified[edu]!)) {
                    substitutesCovering += count;
                }
            }

            const idleSlots = gap - Math.floor(substitutesCovering);

            let factor: number;
            if (isProfitable && idleSlots > 0) {
                factor = 1 + WAGE_ADJUSTMENT_RATE;
            } else if (isProfitable && gap > 0) {
                factor = 1 + WAGE_ADJUSTMENT_RATE * 0.25;
            } else if (isProfitable && gap <= 0) {
                factor = 1 - WAGE_ADJUSTMENT_RATE * 0.25;
            } else if (!isProfitable && idleSlots > 0) {
                factor = 1 - WAGE_ADJUSTMENT_RATE * 0.5;
            } else {
                factor = 1 - WAGE_ADJUSTMENT_RATE * 2;
            }

            assets.wagePerEdu[edu] = Math.max(MIN_WAGE, Math.min(MAX_WAGE, assets.wagePerEdu[edu] * factor));
        }

        for (let i = 0; i < educationLevelKeys.length - 1; i++) {
            const currentEdu = educationLevelKeys[i];
            const nextEdu = educationLevelKeys[i + 1];
            if (assets.wagePerEdu[currentEdu] > assets.wagePerEdu[nextEdu]) {
                assets.wagePerEdu[currentEdu] = assets.wagePerEdu[nextEdu];
            }
        }

        if (agent.automated && agent.id !== planet.governmentId) {
            const netBalance =
                assets.deposits - assets.activeLoans.reduce((sum, loan) => sum + loan.remainingPrincipal, 0);
            const reservationCapital = computeReservationCapital(assets);
            const excessCash = netBalance - reservationCapital;

            if (excessCash > 0) {
                let totalWorkers = 0;
                for (const edu of educationLevelKeys) {
                    totalWorkers += totalActiveForEdu(workforce, edu);
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
                            const agentWorkers = ageCohort[edu];
                            if (!agentWorkers) {
                                continue;
                            }
                            const activeWorkers = agentWorkers.active;
                            if (activeWorkers <= 0) {
                                continue;
                            }
                            const cat = demography[age].employed[edu];
                            if (cat.total <= 0) {
                                continue;
                            }
                            totalCredit += creditWageIncome(bank, cat, perWorkerBonus, activeWorkers);
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
