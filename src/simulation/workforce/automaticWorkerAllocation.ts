import {
    MAX_WAGE,
    MIN_WAGE,
    SPRING_K,
    WAGE_ADJUSTMENT_RATE,
    WAGE_BARGAINING_GAIN,
    WAGE_CEILING_SMOOTHING,
    WAGE_FEEDBACK_GAIN,
    WAGE_SHARE,
} from '../constants';
import type { Agent, Planet } from '../planet/planet';
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

export function automaticWageAdjustment(agents: Map<string, Agent>, planet: Planet): void {
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
        const targetWage = ceiling > 0 ? WAGE_SHARE * ceiling : MIN_WAGE;
        const bargainingReference = ceiling > 0 ? ceiling : MIN_WAGE;
        const bargainingPull =
            totalWorkers > 0 ? (WAGE_BARGAINING_GAIN * (targetWage - avgWage)) / bargainingReference : 0;
        const springPenalty = ceiling > 0 ? SPRING_K * Math.max(0, (avgWage - ceiling) / ceiling) : 0;

        for (const edu of educationLevelKeys) {
            const current = assets.wagePerEdu[edu] ?? MIN_WAGE;

            const capacity = assets.totalSlotCapacity?.[edu] ?? 0;
            const shortage = Math.max(0, capacity - slotsFilled[edu]) / Math.max(1, capacity);
            const shortagePressure = shortage * shortage;

            const pressure = shortagePressure + bargainingPull - springPenalty;

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
    }
}
