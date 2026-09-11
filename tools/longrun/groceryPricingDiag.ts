import fs from 'node:fs';
import path from 'node:path';

import { TICKS_PER_YEAR } from '../../src/simulation/constants';
import { advanceTick } from '../../src/simulation/engine';
import { queryStorageFacility } from '../../src/simulation/planet/facility';
import type { GameState } from '../../src/simulation/planet/planet';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { setRngState } from '../../src/simulation/utils/stochasticRound';

const CKPT = path.join(__dirname, 'results', 'refillfix-6000y');
const OUT = path.join(__dirname, 'results', 'groceryPricingDiag.tsv');
const RESOURCE = process.env.PRICING_RESOURCE ?? 'Grocery';
const START_YEAR = Number(process.env.PRICING_START_YEAR ?? 74);
const END_YEAR = Number(process.env.PRICING_END_YEAR ?? 80);
const EVERY = Number(process.env.PRICING_EVERY ?? 3);

function num(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function main(): void {
    const meta = JSON.parse(fs.readFileSync(path.join(CKPT, 'checkpoint.json'), 'utf8')) as {
        tick: number;
        rng: [number, number];
    };
    const gs: GameState = deserializeSnapshot(fs.readFileSync(path.join(CKPT, 'checkpoint.bin')));
    setRngState(meta.rng);
    const planetId = gs.planets.keys().next().value as string;
    const planet = gs.planets.get(planetId)!;
    const start = meta.tick + 1;
    const end = Math.round(END_YEAR * TICKS_PER_YEAR);
    const from = Math.round(START_YEAR * TICKS_PER_YEAR);
    const rows: string[] = [];

    for (let t = start; t <= end; t++) {
        gs.tick = t;
        advanceTick(gs);
        if (t < from || (t - start) % EVERY !== 0) {
            continue;
        }
        for (const agent of gs.agents.values()) {
            const assets = agent.assets[planetId];
            if (!assets) {
                continue;
            }
            const offer = assets.market?.sell?.[RESOURCE];
            if (!offer) {
                continue;
            }
            const diag = offer.diagnostics as Record<string, number> | undefined;
            const inv = queryStorageFacility(assets.storage, RESOURCE);
            const row: Record<string, string> = {
                tick: String(t),
                year: (t / TICKS_PER_YEAR).toFixed(4),
                agent: agent.id,
                offerPrice: num(offer.offerPrice).toFixed(4),
                retainment: num(offer.offerRetainment).toFixed(2),
                placedQty: num(offer.lastPlacedQty).toFixed(2),
                lastSold: num(offer.lastSold).toFixed(2),
                inventory: inv.toFixed(2),
                smoothedST:
                    offer.smoothedSellThrough === undefined ? 'undef' : num(offer.smoothedSellThrough).toFixed(4),
                sellThroughRate: diag ? num(diag.sellThroughRate).toFixed(4) : 'nod',
                baseFactor: diag ? num(diag.baseFactor).toFixed(4) : 'nod',
                costSpring: diag ? num(diag.costSpringDeviation).toFixed(4) : 'nod',
                netFactor: diag ? num(diag.netFactor).toFixed(4) : 'nod',
                effectiveQuantity: diag ? num(diag.effectiveQuantity).toFixed(2) : 'nod',
                rawRetainment: diag ? num(diag.rawRetainment).toFixed(2) : 'nod',
                costFloor: diag ? num(diag.costFloor).toFixed(3) : 'nod',
                marketPrice: num(planet.marketPrices[RESOURCE]).toFixed(3),
            };
            rows.push(Object.values(row).join('\t'));
        }
    }
    fs.writeFileSync(OUT, Object.keys({
        tick: '', year: '', agent: '', offerPrice: '', retainment: '', placedQty: '', lastSold: '',
        inventory: '', smoothedST: '', sellThroughRate: '', baseFactor: '', costSpring: '', netFactor: '',
        effectiveQuantity: '', rawRetainment: '', costFloor: '', marketPrice: '',
    }).join('\t') + '\n' + rows.join('\n') + '\n');
    console.log(`done ${rows.length} rows -> ${OUT}`);
}

main();
