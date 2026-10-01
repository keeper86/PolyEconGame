import {
    MAX_WAGE,
    MIN_WAGE,
    QUIT_TARGET_RATE,
    WAGE_ADJUSTMENT_RATE,
    WAGE_CEILING_SMOOTHING,
    WAGE_CHURN_GAIN,
    HIRE_RATE_LIMIT_PER_MONTH,
} from '../constants';
import { perTickLimit } from './hireWorkforce';
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
        const previousTarget = assets.allocatedWorkers;
        for (const edu of educationLevelKeys) {
            const ownUnfilled = Math.max(0, totalSlotCapacity[edu] - slotFill[edu]);
            const headcount = totalUsed[edu] + slotFill[edu];
            const rawTarget = Math.ceil((totalUsed[edu] + ownUnfilled) * (1 + ACCEPTABLE_IDLE_FRACTION));
            const previous = previousTarget?.[edu] ?? rawTarget;
            if (headcount <= 0) {
                newTarget[edu] = rawTarget;
                continue;
            }
            const maxStep = perTickLimit(headcount, hireRateLimitPerMonth);
            newTarget[edu] = Math.round(Math.max(previous - maxStep, Math.min(previous + maxStep, rawTarget)));
        }

        assets.allocatedWorkers = newTarget;
    }
}

let hireRateLimitPerMonth = HIRE_RATE_LIMIT_PER_MONTH;

export const setHireRateLimitPerMonth = (value: number): void => {
    hireRateLimitPerMonth = value;
};

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

        const monthlyQuits = assets._monthlyVoluntaryQuits ?? { none: 0, primary: 0, secondary: 0, tertiary: 0 };
        assets._monthlyVoluntaryQuits = { none: 0, primary: 0, secondary: 0, tertiary: 0 };

        const wageStepDebug: Record<
            string,
            { shortagePressure: number; churnPressure: number; quitRate: number; ceiling: number }
        > = {};
        for (const edu of educationLevelKeys) {
            const current = assets.wagePerEdu[edu] ?? MIN_WAGE;

            const capacity = assets.totalSlotCapacity?.[edu] ?? 0;
            const shortage = Math.max(0, capacity - slotsFilled[edu]) / Math.max(1, capacity);
            const shortagePressure = shortage * shortage;

            const active = totalActiveForEdu(workforce, edu);
            const quitRate = active > 0 ? monthlyQuits[edu] / active : 0;
            const churnPressure = WAGE_CHURN_GAIN * (quitRate - QUIT_TARGET_RATE);

            const pressure = shortagePressure + churnPressure;
            wageStepDebug[edu] = { shortagePressure, churnPressure, quitRate, ceiling };

            const maxStep = WAGE_ADJUSTMENT_RATE * current;
            const step = Math.max(-maxStep, Math.min(maxStep, current * pressure));
            assets.wagePerEdu[edu] = Math.max(MIN_WAGE, Math.min(MAX_WAGE, current + step));
        }

        for (let i = 0; i < educationLevelKeys.length - 1; i++) {
            const currentEdu = educationLevelKeys[i];
            const nextEdu = educationLevelKeys[i + 1];
            if (assets.wagePerEdu[currentEdu] > assets.wagePerEdu[nextEdu]) {
                assets.wagePerEdu[nextEdu] = assets.wagePerEdu[currentEdu];
            }
        }

        assets._wageStepDebug = wageStepDebug;
    }
}
