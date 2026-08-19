import {
    MAX_WAGE,
    MIN_WAGE,
    PROFIT_SHARING_ENABLED,
    SPRING_K,
    WAGE_ADJUSTMENT_RATE,
    WAGE_CEILING_SMOOTHING,
    WAGE_FEEDBACK_GAIN,
    WAGE_NEUTRAL_PRESSURE,
} from '../constants';
import { creditWageIncome } from '../financial/wealthOps';
import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { ACCEPTABLE_IDLE_FRACTION } from './laborMarket';
import { sumSlotFillByEdu, sumTotalUsedByEdu, totalActiveForEdu } from './workforceAggregates';

export function automaticWorkerAllocation(agents: Map<string, Agent>, planet: Planet): void {
    for (const agent of agents.values()) {
        if (!agent.automated && !agent.automateWorkerAllocation) {
            continue;
        }
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }

        const totalSlotCapacity: Record<EducationLevelType, number> = assets.totalSlotCapacity ?? {
            none: 0,
            primary: 0,
            secondary: 0,
            tertiary: 0,
        };

        const totalUsed = sumTotalUsedByEdu(assets);
        const slotFill = sumSlotFillByEdu(assets);

        const newTarget: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
        for (const edu of educationLevelKeys) {
            const ownUnfilled = Math.max(0, totalSlotCapacity[edu] - slotFill[edu]);

            let target = totalUsed[edu] + ownUnfilled;
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

        const slotsFilled = sumSlotFillByEdu(assets);

        const lastMonth = assets.lastMonthAcc;
        const affordable = lastMonth.revenue - lastMonth.purchases - lastMonth.claimPayments;
        const rawCeiling = lastMonth.totalWorkersTicks > 0 ? affordable / lastMonth.totalWorkersTicks : 0;
        const prevCeiling = assets._smoothedWageCeiling ?? rawCeiling;
        assets._smoothedWageCeiling = WAGE_CEILING_SMOOTHING * rawCeiling + (1 - WAGE_CEILING_SMOOTHING) * prevCeiling;
        const ceiling = assets._smoothedWageCeiling;

        let totalWageBill = 0;
        let totalWorkers = 0;
        for (const edu of educationLevelKeys) {
            const active = totalActiveForEdu(workforce, edu);
            totalWageBill += (assets.wagePerEdu[edu] ?? 0) * active;
            totalWorkers += active;
        }
        const avgWage = totalWorkers > 0 ? totalWageBill / totalWorkers : 0;
        const springPenalty = ceiling > 0 ? SPRING_K * Math.max(0, (avgWage - ceiling) / ceiling) : 0;

        for (const edu of educationLevelKeys) {
            const current = assets.wagePerEdu[edu] ?? MIN_WAGE;

            const capacity = assets.totalSlotCapacity?.[edu] ?? 0;
            const shortage = Math.max(0, capacity - slotsFilled[edu]) / Math.max(1, capacity);
            const shortagePressure = shortage * shortage;

            const pressure = shortagePressure - WAGE_NEUTRAL_PRESSURE - springPenalty;

            const maxStep = WAGE_ADJUSTMENT_RATE * current;
            const step = Math.max(-maxStep, Math.min(maxStep, WAGE_FEEDBACK_GAIN * current * pressure));
            assets.wagePerEdu[edu] = Math.max(MIN_WAGE, Math.min(MAX_WAGE, current + step));
        }

        for (let i = 0; i < educationLevelKeys.length - 1; i++) {
            const currentEdu = educationLevelKeys[i];
            const nextEdu = educationLevelKeys[i + 1];
            if (assets.wagePerEdu[currentEdu] > assets.wagePerEdu[nextEdu]) {
                assets.wagePerEdu[nextEdu] = assets.wagePerEdu[currentEdu];
            }
        }

        if (PROFIT_SHARING_ENABLED && agent.automated && agent.id !== planet.governmentId) {
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
