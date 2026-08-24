import { TICKS_PER_YEAR } from '../../src/simulation/constants';
import { computeNormalizedBuffer } from '../../src/simulation/market/serviceBufferNormalizer';
import type { GameState, Planet } from '../../src/simulation/planet/planet';
import { processedFoodResourceType } from '../../src/simulation/planet/resources';
import { groceryServiceResourceType } from '../../src/simulation/planet/services';
import { loadSnapshotFromDb, listSnapshotTicks } from './db';

function arg(name: string): string | undefined {
    const prefix = `--${name}=`;
    const found = process.argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
}

function marketRow(planet: Planet, resourceName: string): { demand: number; supply: number; fill: number; price: number } {
    const result = planet.lastMarketResult[resourceName];
    const demand = result?.totalDemand ?? 0;
    const supply = result?.totalSupply ?? 0;
    const fill = demand > 0 ? Math.max(0, 1 - (result?.unfilledDemand ?? 0) / demand) : 0;
    const price =
        result && result.totalVolume > 0 && result.clearingPrice > 0
            ? result.clearingPrice
            : (planet.marketPrices[resourceName] ?? 0);
    return { demand, supply, fill, price };
}

function facilityAggregate(
    gameState: GameState,
    planetId: string,
    resourceName: string,
): { count: number; scale: number; maxScale: number; produced: number; constructing: number; targetDelta: number } {
    let count = 0;
    let scale = 0;
    let maxScale = 0;
    let produced = 0;
    let constructing = 0;
    let targetDelta = 0;
    for (const agent of gameState.agents.values()) {
        const assets = agent.assets[planetId];
        if (!assets) {
            continue;
        }
        for (const facility of assets.productionFacilities ?? []) {
            if (!facility.produces.some((p) => p.resource.name === resourceName)) {
                continue;
            }
            count += 1;
            scale += facility.scale;
            maxScale += facility.maxScale;
            produced += facility.lastTickResults?.lastProduced?.[resourceName] ?? 0;
            if (facility.construction?.type === 'expansion') {
                constructing += 1;
                targetDelta += facility.construction.constructionTargetMaxScale - facility.maxScale;
            }
        }
    }
    return { count, scale, maxScale, produced, constructing, targetDelta };
}

function groceryFillRate(planet: Planet): number {
    const result = planet.lastMarketResult[groceryServiceResourceType.name];
    if (!result || result.totalDemand <= 0) {
        return 0;
    }
    return Math.max(0, 1 - result.unfilledDemand / result.totalDemand);
}

async function main(): Promise<void> {
    const fromYear = arg('from') !== undefined ? Number(arg('from')) : undefined;
    const toYear = arg('to') !== undefined ? Number(arg('to')) : undefined;

    const ticks = (await listSnapshotTicks()).filter((tick) => {
        const year = Math.floor(tick / TICKS_PER_YEAR);
        if (fromYear !== undefined && year < fromYear) {
            return false;
        }
        if (toYear !== undefined && year > toYear) {
            return false;
        }
        return true;
    });

    const header = [
        'yr',
        'tick',
        'groceryBuffer',
        'groceryFill',
        'pfDemand',
        'pfSupply',
        'pfFill',
        'pfPrice',
        'fpCount',
        'fpScale',
        'fpMaxScale',
        'fpProduced',
        'fpConstructing',
        'fpTargetDelta',
        'gcCount',
        'gcScale',
        'gcProduced',
    ];
    console.log(header.join('\t'));

    for (const tick of ticks) {
        const gameState = await loadSnapshotFromDb(tick);
        const planet = gameState.planets.get('earth');
        if (!planet) {
            continue;
        }
        const pf = marketRow(planet, processedFoodResourceType.name);
        const fp = facilityAggregate(gameState, planet.id, processedFoodResourceType.name);
        const gc = facilityAggregate(gameState, planet.id, groceryServiceResourceType.name);
        const cells = [
            Math.floor(tick / TICKS_PER_YEAR),
            tick,
            computeNormalizedBuffer(planet, 'grocery').toFixed(4),
            groceryFillRate(planet).toFixed(4),
            pf.demand.toFixed(0),
            pf.supply.toFixed(0),
            pf.fill.toFixed(4),
            pf.price.toFixed(3),
            fp.count,
            fp.scale.toFixed(0),
            fp.maxScale.toFixed(0),
            fp.produced.toFixed(0),
            fp.constructing,
            fp.targetDelta.toFixed(0),
            gc.count,
            gc.scale.toFixed(0),
            gc.produced.toFixed(0),
        ];
        console.log(cells.join('\t'));
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
