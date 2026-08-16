import assert from 'assert';
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

export function computeFacilitySignal(facility: ProductionFacility, planet: Planet): number {
    const { produces } = facility;

    let weightedUnfilledSum = 0;
    let totalWeight = 0;
    let noData = 0;

    for (const output of produces) {
        const lastResult = planet.lastMarketResult[output.resource.name];

        if (!lastResult) {
            noData++;
            continue;
        }

        const price = lastResult.clearingPrice;
        assert(isFinite(price) && price > 0, 'Price should be positive and finite, but got' + price);

        const totalDemand = lastResult.totalDemand;
        const unfilledFrac = totalDemand > 0 ? lastResult.unfilledDemand / totalDemand : 0;

        assert(
            unfilledFrac >= 0 && unfilledFrac <= 1,
            'Unfilled fraction should be between 0 and 1, but got' + unfilledFrac,
        );

        weightedUnfilledSum += price * unfilledFrac;
        totalWeight += price;
    }

    if (totalWeight === 0) {
        if (noData !== produces.length) {
            console.error('No market data for any outputs of facility', facility.id);
        }
        return 0;
    }

    const shortageSignal = weightedUnfilledSum / totalWeight;

    assert(
        isFinite(shortageSignal) && shortageSignal >= 0 && shortageSignal <= 1,
        'Shortage signal should be between 0 and 1, but got' + shortageSignal,
    );

    return shortageSignal;
}
