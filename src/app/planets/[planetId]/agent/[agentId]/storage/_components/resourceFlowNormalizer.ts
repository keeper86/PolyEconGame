import { TICKS_PER_MONTH } from '@/simulation/constants';

export type FlowRates = {
    lastTickRate: number;
    currentMonthAvgRate: number;
    prevMonthAvgRate: number;
};

export type ResourceFlowData = {
    inflow: FlowRates;
    outflow: FlowRates;
    depreciation: FlowRates;
};

/**
 * Compute normalized rates (units/tick) for a single flow category.
 *
 * @param perTick – exact delta from the most recent game tick
 * @param monthAcc – cumulative quantity this month
 * @param lastMonthAcc – cumulative quantity for the entire previous month
 * @param elapsedTicks – how many ticks have occurred this month (1..TICKS_PER_MONTH)
 */
export function computeFlowRates(
    perTick: number,
    monthAcc: number,
    lastMonthAcc: number,
    elapsedTicks: number,
): FlowRates {
    return {
        lastTickRate: perTick,
        currentMonthAvgRate: elapsedTicks > 0 ? monthAcc / elapsedTicks : 0,
        prevMonthAvgRate: TICKS_PER_MONTH > 0 ? lastMonthAcc / TICKS_PER_MONTH : 0,
    };
}

/**
 * Aggregate all three flow categories for a resource.
 *
 * Inflow  = production + bought
 * Outflow = consumption + sold
 * Depreciation = depreciation (isolated)
 */
export function computeResourceFlowData(
    perTick: { prod: number; cons: number; depr: number; bought: number; sold: number },
    monthAcc: { produced: number; consumed: number; depreciated: number; bought: number; sold: number },
    lastMonthAcc: { produced: number; consumed: number; depreciated: number; bought: number; sold: number },
    elapsedTicks: number,
): ResourceFlowData {
    return {
        inflow: computeFlowRates(
            perTick.prod + perTick.bought,
            monthAcc.produced + monthAcc.bought,
            lastMonthAcc.produced + lastMonthAcc.bought,
            elapsedTicks,
        ),
        outflow: computeFlowRates(
            perTick.cons + perTick.sold,
            monthAcc.consumed + monthAcc.sold,
            lastMonthAcc.consumed + lastMonthAcc.sold,
            elapsedTicks,
        ),
        depreciation: computeFlowRates(perTick.depr, monthAcc.depreciated, lastMonthAcc.depreciated, elapsedTicks),
    };
}

/**
 * Compute elapsed ticks in the current month from the global game tick.
 */
export function elapsedTicksThisMonth(tick: number): number {
    const mod = tick % TICKS_PER_MONTH;
    return mod === 0 ? TICKS_PER_MONTH : mod;
}
