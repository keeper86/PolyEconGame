import assert from 'assert';
import {
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_UP,
    TARGET_FILL_RATE,
    TARGET_FILL_RATE_SERVICES,
} from '../../constants';
import { fillRateFactor } from '../../market/automaticPricing';
import type { ProductionFacility } from '../facility';
import type { Planet } from '../planet';

export function computeFacilityProfitThisTick(facility: ProductionFacility): number {
    const revenue = facility.lastTickResults.revenue ?? 0;
    const wages = facility.lastTickResults.wageCosts ?? 0;
    const inputCosts = facility.lastTickResults.inputCosts ?? 0;
    return revenue - wages - inputCosts;
}

export function computeProfitMargin(profitEMA: number, revenueEMA: number): number {
    if (profitEMA >= 0) {
        return 0;
    }
    if (revenueEMA <= 0) {
        return -1;
    }
    return Math.max(-1, profitEMA / revenueEMA);
}

export function computeFacilitySignal(
    facility: ProductionFacility,
    planet: Planet,
    flowSellThroughByResource: Readonly<Record<string, number>> = {},
): number {
    const { produces } = facility;

    let weightedSignalSum = 0;
    let totalWeight = 0;

    for (const output of produces) {
        const lastResult = planet.lastMarketResult[output.resource.name];

        if (!lastResult) {
            continue;
        }

        const price = lastResult.clearingPrice;
        assert(isFinite(price) && price > 0, 'Price should be positive and finite, but got' + price);

        const totalDemand = lastResult.totalDemand;
        const unfilledFrac = totalDemand > 0 ? lastResult.unfilledDemand / totalDemand : 0;

        const flowSellThrough = flowSellThroughByResource[output.resource.name];
        const flowDeviation = flowSellThrough !== undefined ? flowSellThrough - 1 : 0;

        weightedSignalSum += price * (unfilledFrac + flowDeviation);
        totalWeight += price;
    }

    if (totalWeight === 0) {
        return 0;
    }

    return Math.max(-1, Math.min(1, weightedSignalSum / totalWeight));
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

export function estimateProfitAtScale(facility: ProductionFacility, planet: Planet, targetScale: number): number {
    const currentScale = facility.scale;
    const efficiency = facility.lastTickResults.overallEfficiency ?? 0;
    const wages = facility.lastTickResults.wageCosts ?? 0;
    const inputCosts = facility.lastTickResults.inputCosts ?? 0;

    const resourceEfficiencies = Object.values(facility.lastTickResults.resourceEfficiency ?? {});
    const inputStarved = resourceEfficiencies.length > 0 && Math.min(...resourceEfficiencies) < 1;

    let revenue = 0;
    for (const output of facility.produces) {
        const result = planet.lastMarketResult[output.resource.name];
        if (!result || result.totalDemand <= 0) {
            continue;
        }

        const targetFillRate = output.resource.form === 'services' ? TARGET_FILL_RATE_SERVICES : TARGET_FILL_RATE;
        const fillRate = result.totalDemand > 0 ? clamp01(1 - result.unfilledDemand / result.totalDemand) : 1;
        const fairPrice =
            result.clearingPrice * fillRateFactor(fillRate, targetFillRate, PRICE_ADJUST_MAX_UP, PRICE_ADJUST_MAX_DOWN);

        const effectiveScale = inputStarved ? Math.min(targetScale, currentScale) : targetScale;
        const outputAtScale = output.quantity * effectiveScale * efficiency;
        const sold = Math.min(outputAtScale, result.totalDemand);
        revenue += fairPrice * sold;
    }

    const scaleRatio = currentScale > 0 ? targetScale / currentScale : 1;
    const cost = (wages + inputCosts) * scaleRatio;

    return revenue - cost;
}
