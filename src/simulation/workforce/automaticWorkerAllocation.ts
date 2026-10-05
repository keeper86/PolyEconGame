import {
    MAX_WAGE,
    MIN_WAGE,
    QUIT_TARGET_RATE,
    WAGE_ADJUSTMENT_RATE,
    WAGE_CEILING_SMOOTHING,
    WAGE_CHURN_GAIN,
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
            newTarget[edu] = Math.ceil((totalUsed[edu] + ownUnfilled) * (1 + ACCEPTABLE_IDLE_FRACTION));
        }

        assets.allocatedWorkers = newTarget;
    }
}

let pinWagesToMinimum = false;

export const setPinWagesToMinimum = (value: boolean): void => {
    pinWagesToMinimum = value;
};

const capAtAffordability = (wage: number, ceiling: number): number =>
    ceiling >= MIN_WAGE ? Math.min(wage, ceiling) : wage;

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
            const current = pinWagesToMinimum ? MIN_WAGE : (assets.wagePerEdu[edu] ?? MIN_WAGE);

            const capacity = assets.totalSlotCapacity?.[edu] ?? 0;
            const shortage = Math.max(0, capacity - slotsFilled[edu]) / Math.max(1, capacity);
            const shortagePressure = shortage * shortage;

            const active = totalActiveForEdu(workforce, edu);
            const quitRate = active > 0 ? monthlyQuits[edu] / active : 0;
            const churnPressure = WAGE_CHURN_GAIN * (quitRate - QUIT_TARGET_RATE);

            const pressure = shortagePressure + churnPressure;
            wageStepDebug[edu] = { shortagePressure, churnPressure, quitRate, ceiling };

            const maxStep = WAGE_ADJUSTMENT_RATE * current;
            const step = pinWagesToMinimum ? 0 : Math.max(-maxStep, Math.min(maxStep, current * pressure));
            const raised = capAtAffordability(current + step, ceiling);
            assets.wagePerEdu[edu] = Math.max(MIN_WAGE, Math.min(MAX_WAGE, raised));
        }

        for (let i = educationLevelKeys.length - 2; i >= 0; i--) {
            const lowerEdu = educationLevelKeys[i];
            const higherEdu = educationLevelKeys[i + 1];
            if (assets.wagePerEdu[lowerEdu] > assets.wagePerEdu[higherEdu]) {
                assets.wagePerEdu[lowerEdu] = assets.wagePerEdu[higherEdu];
            }
        }

        assets._wageStepDebug = wageStepDebug;
    }
}
