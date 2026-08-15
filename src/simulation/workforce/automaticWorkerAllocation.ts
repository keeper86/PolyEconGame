import {
    AFFORDABILITY_GAIN,
    BASELINE_VOLUNTARY_QUIT_RATIO,
    FILL_GAIN,
    MAX_WAGE,
    MIN_WAGE,
    RETENTION_GAIN,
    WAGE_PID_DRIFT_DOWN,
    WAGE_PID_IMAX,
    WAGE_PID_KI,
    WAGE_PID_KP,
} from '../constants';
import { creditWageIncome } from '../financial/wealthOps';
import { nullWagePidState } from '../planet/facility';
import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
import { operatingProfit } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { ACCEPTABLE_IDLE_FRACTION } from './laborMarket';
import { totalActiveForEdu, totalOnboardingForEdu, totalVoluntaryDepartingForEdu } from './workforceAggregates';

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
    // If we have no last month data yet, fall back to current month (which may still be incomplete)
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

        const profitSignal = operatingProfit(assets.lastMonthAcc) + operatingProfit(assets.monthAcc);
        const pidState = assets.humanResourcesDepartment?.wagePidState ?? nullWagePidState();

        for (const edu of educationLevelKeys) {
            const target = assets.allocatedWorkers[edu] ?? 0;
            const headcount = totalActiveForEdu(workforce, edu) + totalOnboardingForEdu(workforce, edu);
            const fillShortfall = target > 0 ? Math.max(0, target - headcount) / target : 0;
            const quitRatio = totalVoluntaryDepartingForEdu(workforce, edu) / Math.max(1, headcount);
            const excessQuit = Math.max(0, quitRatio - BASELINE_VOLUNTARY_QUIT_RATIO);

            const currentWage = assets.wagePerEdu[edu] ?? MIN_WAGE;
            const upward = profitSignal > 0 ? FILL_GAIN * fillShortfall + RETENTION_GAIN * excessQuit : 0;
            const error = upward - (profitSignal <= 0 ? AFFORDABILITY_GAIN : 0) - WAGE_PID_DRIFT_DOWN;

            const cell = pidState[edu];
            cell.integral = Math.max(-WAGE_PID_IMAX, Math.min(WAGE_PID_IMAX, cell.integral + error));
            const delta = WAGE_PID_KP * error + WAGE_PID_KI * cell.integral;
            cell.prevError = error;

            assets.wagePerEdu[edu] = Math.max(MIN_WAGE, Math.min(MAX_WAGE, currentWage * (1 + delta)));
        }

        // --- Enforce Monotonicity
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
                                // cat should be populated if agent has active workers there
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
