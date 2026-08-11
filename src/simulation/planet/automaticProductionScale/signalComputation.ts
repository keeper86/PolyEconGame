import assert from 'assert';
import type { ProductionFacility } from '../facility';
import { queryStorageFacility } from '../facility';
import type { AgentPlanetAssets, Planet } from '../planet';

export function computeFacilityProfitThisTick(facility: ProductionFacility): number {
    const revenue = facility.lastTickResults.revenue ?? 0;
    const wages = facility.lastTickResults.wageCosts ?? 0;
    const inputCosts = facility.lastTickResults.inputCosts ?? 0;
    return revenue - wages - inputCosts;
}

export function computeFacilitySignal(facility: ProductionFacility, assets: AgentPlanetAssets, planet: Planet): number {
    const { produces } = facility;

    let weightedOutputSignalSum = 0;
    let totalWeight = 0;
    let noData = 0;

    const storage = assets.storageFacility;

    for (const output of produces) {
        const lastResult = planet.lastMarketResult[output.resource.name];

        if (!lastResult) {
            noData++;
            continue;
        }

        const avg = lastResult;

        const price = avg.clearingPrice;
        assert(isFinite(price) && price > 0, 'Price should be positive and finite, but got' + price);

        const totalDemand = avg.totalDemand;
        const totalSupply = avg.totalSupply;
        const ownSupply = queryStorageFacility(storage, output.resource.name);

        assert(
            isFinite(ownSupply) && ownSupply >= 0,
            'Own supply should be non-negative and finite, but got' +
                ownSupply +
                ', resource=' +
                output.resource.name +
                ', facility=' +
                facility.name,
        );

        const unfilledFrac = totalDemand > 0 ? avg.unfilledDemand / totalDemand : 0;
        const rawUnsoldFrac = totalSupply > 0 ? avg.unsoldSupply / totalSupply : 0;
        const unsoldFrac = rawUnsoldFrac / (rawUnsoldFrac + 0.5);
        const balance = (avg.unfilledDemand - avg.unsoldSupply) / Math.max(1, avg.unfilledDemand + avg.unsoldSupply);

        assert(
            unfilledFrac >= 0 && unfilledFrac <= 1,
            'Unfilled fraction should be between 0 and 1, but got' + unfilledFrac,
        );
        assert(unsoldFrac >= 0 && unsoldFrac <= 1, 'Unsold fraction should be between 0 and 1, but got' + unsoldFrac);
        assert(avg.unfilledDemand >= 0, 'Unfilled demand should be non-negative, but got' + avg.unfilledDemand);
        assert(avg.unsoldSupply >= 0, 'Unsold supply should be non-negative, but got' + JSON.stringify(avg));
        assert(balance >= -1 && balance <= 1, 'Balance should be between -1 and 1, but got' + balance);

        const WEIGHT_UNFILLED = 1.0;
        const WEIGHT_UNSOLD = 0.5;
        const WEIGHT_BALANCE = 2.0;

        weightedOutputSignalSum +=
            price * (WEIGHT_UNFILLED * unfilledFrac - WEIGHT_UNSOLD * unsoldFrac + WEIGHT_BALANCE * balance);
        totalWeight += price * (WEIGHT_UNFILLED + WEIGHT_UNSOLD + WEIGHT_BALANCE);
    }

    if (totalWeight === 0) {
        if (noData !== produces.length) {
            console.error('No market data for any outputs of facility', facility.id);
        }
        return 0;
    }

    const maxOutputSignal = weightedOutputSignalSum / totalWeight;

    assert(
        isFinite(maxOutputSignal) && maxOutputSignal >= -1 && maxOutputSignal <= 1,
        'Max output signal should be between -1 and 1, but got' + maxOutputSignal,
    );

    return maxOutputSignal;
}
