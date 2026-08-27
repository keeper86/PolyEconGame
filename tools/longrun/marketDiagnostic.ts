import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '../../src/simulation/constants';
import { advanceTick, seedRng } from '../../src/simulation/engine';
import { maintenanceServiceResourceType, constructionServiceResourceType } from '../../src/simulation/planet/services';
import { buildBenchmarkWorld } from './world';
import type { Planet } from '../../src/simulation/planet/planet';

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) {
        return Number.NaN;
    }
    const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
    return sorted[idx]!;
}

function sampleMarket(planet: Planet, resourceName: string): void {
    const ob = planet.orderBooks?.[resourceName];
    const result = planet.lastMarketResult[resourceName];
    const costFloor = planet.lastProductionCostFloors[resourceName] ?? 0;
    const marketPrice = planet.marketPrices[resourceName] ?? 0;
    const askPrices = (ob?.asks ?? []).map((a) => a.price);
    const bidPrices = (ob?.bids ?? []).map((b) => b.price);
    const askQty = (ob?.asks ?? []).reduce((s, a) => s + a.quantity, 0);
    const bidQty = (ob?.bids ?? []).reduce((s, b) => s + b.quantity, 0);
    const askMin = askPrices.length > 0 ? Math.min(...askPrices) : 0;
    const askMed = percentile([...askPrices].sort((a, b) => a - b), 0.5);
    const bidMax = bidPrices.length > 0 ? Math.max(...bidPrices) : 0;
    const bidMed = percentile([...bidPrices].sort((a, b) => b - a), 0.5);
    const overlap = bidPrices.length > 0 && askPrices.length > 0 && bidMax >= askMin;
    console.log(
        `${resourceName}: floor=${costFloor.toFixed(1)} price=${marketPrice.toFixed(1)} ` +
            `asks[${askPrices.length}]=${askMin.toFixed(1)}..${askMed.toFixed(1)} qty=${askQty.toFixed(0)} ` +
            `bids[${bidPrices.length}]=${bidMed.toFixed(1)}..${bidMax.toFixed(1)} qty=${bidQty.toFixed(0)} ` +
            `overlap=${overlap} ` +
            `res: vol=${(result?.totalVolume ?? 0).toFixed(0)} dem=${(result?.totalDemand ?? 0).toFixed(0)} ` +
            `supp=${(result?.totalSupply ?? 0).toFixed(0)} unf=${(result?.unfilledDemand ?? 0).toFixed(0)} ` +
            `unsold=${(result?.unsoldSupply ?? 0).toFixed(0)}`,
    );
}

function main(): void {
    const years = Number(process.argv[2] ?? 8);
    const resource = process.argv[3] ?? 'Maintenance';
    const scenario = Number(process.argv[4] ?? 1001);
    seedRng(scenario);
    const { gameState, planet } = buildBenchmarkWorld({});

    const totalTicks = years * TICKS_PER_YEAR;
    console.log('tick year');
    for (let t = 1; t <= totalTicks; t++) {
        gameState.tick = t;
        advanceTick(gameState);
        if (t % TICKS_PER_MONTH !== 0) {
            continue;
        }
        console.log(`${t} ${(t / TICKS_PER_YEAR).toFixed(2)}`);
        if (resource === 'Maintenance' || resource === 'Construction' || resource === 'All') {
            if (resource === 'All' || resource === 'Maintenance') {
                sampleMarket(planet, maintenanceServiceResourceType.name);
            }
            if (resource === 'All' || resource === 'Construction') {
                sampleMarket(planet, constructionServiceResourceType.name);
            }
        } else {
            sampleMarket(planet, resource);
        }
    }
}

main();
