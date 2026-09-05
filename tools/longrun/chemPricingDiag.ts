import fs from 'node:fs';
import path from 'node:path';

import { TICKS_PER_YEAR } from '../../src/simulation/constants';
import { advanceTick } from '../../src/simulation/engine';
import { queryStorageFacility } from '../../src/simulation/planet/facility';
import type { GameState } from '../../src/simulation/planet/planet';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { setRngState } from '../../src/simulation/utils/stochasticRound';

const CKPT = path.join(__dirname, 'results', '1agent-flare-6000-8b');
const OUT = path.join(__dirname, 'results', 'chemPricingDiag.tsv');

function num(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function main(): void {
    const meta = JSON.parse(fs.readFileSync(path.join(CKPT, 'checkpoint.json'), 'utf8')) as { tick: number; rng: [number, number] };
    const gs: GameState = deserializeSnapshot(fs.readFileSync(path.join(CKPT, 'checkpoint.bin')));
    setRngState(meta.rng);
    const planetId = gs.planets.keys().next().value as string;
    const planet = gs.planets.get(planetId) as NonNullable<ReturnType<GameState['planets']['get']>>;
    const start = meta.tick + 1;
    const end = Math.round(101.3 * TICKS_PER_YEAR);
    const every = 5;
    const rows: string[] = [];

    for (let t = start; t <= end; t++) {
        gs.tick = t;
        advanceTick(gs);
        if ((t - start) % every !== 0) {
            continue;
        }
        for (const agent of gs.agents.values()) {
            const assets = agent.assets[planetId];
            if (!assets) {
                continue;
            }
            const fac = assets.productionFacilities.find((f) => f.name === 'Oil Refinery');
            if (!fac) {
                continue;
            }
            const offer = (assets.market ?? { sell: {} }).sell['Chemical'];
            if (!offer) {
                continue;
            }
            const diag = offer.diagnostics as Record<string, number> | undefined;
            const inv = queryStorageFacility(assets.storageFacility, 'Chemical');
            const costFloor = planet.lastProductionCostFloors['Chemical'] ?? 0;
            const seg = [
                String(t),
                (t / TICKS_PER_YEAR).toFixed(4),
                `offerPrice${num(offer.offerPrice).toFixed(3)}`,
                `retain${num(offer.offerRetainment).toFixed(0)}`,
                `inv${num(inv).toFixed(0)}`,
                `effQty${num(offer.lastPlacedQty ?? 0).toFixed(0)}`,
                `lastSold${num(offer.lastSold).toFixed(0)}`,
                `smST${offer.smoothedSellThrough === undefined ? 'undef' : num(offer.smoothedSellThrough).toFixed(3)}`,
                `autoBuf${num((offer.autoConfig as { automatedCostFloorBuffer?: number } | undefined)?.automatedCostFloorBuffer).toFixed(2)}`,
                `costFloor${num(costFloor).toFixed(2)}`,
                `mkPrice${num(planet.marketPrices['Chemical'] ?? 0).toFixed(2)}`,
            ];
            if (diag) {
                for (const key of ['sellThroughRate', 'smoothedSellThrough', 'targetSellThrough', 'baseFactor', 'costSpringDeviation', 'netFactor', 'oldPrice', 'newPrice', 'costFloor', 'marketPrice', 'effectiveQuantity', 'rawRetainment']) {
                    seg.push(`${key}${key === 'costFloor' || key === 'marketPrice' || key === 'oldPrice' || key === 'newPrice' ? num(diag[key]).toFixed(2) : key === 'costSpringDeviation' ? num(diag[key]).toFixed(4) : num(diag[key]).toFixed(3)}`);
                }
            } else {
                seg.push('NO_DIAGNOSTICS');
            }
            rows.push(seg.join('\t'));
        }
    }
    fs.writeFileSync(OUT, rows.join('\n') + '\n');
    console.log(`done ${rows.length} rows → ${OUT}`);
}

main();
