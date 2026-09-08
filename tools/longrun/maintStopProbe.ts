import fs from 'node:fs';
import path from 'node:path';

import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '../../src/simulation/constants';
import { advanceTick } from '../../src/simulation/engine';
import { queryStorageFacility } from '../../src/simulation/planet/facility';
import type { GameState } from '../../src/simulation/planet/planet';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { setRngState } from '../../src/simulation/utils/stochasticRound';

const CKPT = path.join(__dirname, 'results', '1agent-flow2-6000-8b');
const OUT = path.join(__dirname, 'results', 'maintStopProbe.tsv');

function num(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function main(): void {
    const meta = JSON.parse(fs.readFileSync(path.join(CKPT, 'checkpoint.json'), 'utf8')) as { tick: number; rng: [number, number] };
    const gs: GameState = deserializeSnapshot(fs.readFileSync(path.join(CKPT, 'checkpoint.bin')));
    setRngState(meta.rng);
    const planetId = gs.planets.keys().next().value as string;
    const planet = gs.planets.get(planetId) as NonNullable<ReturnType<GameState['planets']['get']>>;
    const start = meta.tick;
    const toYear = 159.3;
    const end = Math.round(toYear * TICKS_PER_YEAR);
    const rows: string[] = [];

    for (let t = start + 1; t <= end; t++) {
        gs.tick = t;
        advanceTick(gs);
        if (t % TICKS_PER_MONTH !== 0) {
            continue;
        }
        const mkt = planet.lastMarketResult['Maintenance'];
        for (const agent of gs.agents.values()) {
            const assets = agent.assets[planetId];
            if (!assets) {
                continue;
            }
            const fac = assets.productionFacilities.find((f: { name: string }) => f.name === 'Maintenance Facility');
            if (!fac) {
                continue;
            }
            const mk = assets.market ?? { sell: {}, buy: {} };
            const res = fac.lastTickResults;
            const pid = fac.pidState;
            const offer = mk.sell['Maintenance'];
            const seg = [
                String(t),
                (t / TICKS_PER_YEAR).toFixed(3),
                agent.id,
                `dep${num(assets.deposits).toFixed(0)}`,
                `loans${assets.activeLoans.length}`,
                `scale${num(fac.scale).toFixed(1)}`,
                `mx${num(fac.maxScale).toFixed(1)}`,
                `out${num(res?.lastProduced?.['Maintenance']).toFixed(0)}`,
                `oe${num(res?.overallEfficiency).toFixed(2)}`,
                `rev${num(res?.revenue).toFixed(0)}`,
                `wage${num(res?.wageCosts).toFixed(0)}`,
                `inCost${num(res?.inputCosts).toFixed(0)}`,
                `sig${num(pid?.smoothedSignal).toFixed(2)}`,
                `eI${num(pid?.expansionIntegral).toFixed(0)}`,
                `cI${num(pid?.contractionIntegral).toFixed(0)}`,
                `workers${num(assets.usedWorkers).toFixed(0)}`,
            ];
            for (const inp of ['Steel', 'Electronics', 'Plastic']) {
                seg.push(`${inp}st${num(queryStorageFacility(assets.storage, inp)).toFixed(0)}`);
            }
            seg.push(`maintStor${num(queryStorageFacility(assets.storage, 'Maintenance')).toFixed(0)}`);
            seg.push(`ask${num(offer?.offerPrice ?? offer?.lastOfferPrice).toFixed(2)}`, `sold${num(offer?.lastSold).toFixed(0)}`, `placed${num(offer?.lastPlacedQty).toFixed(0)}`, `retain${num(offer?.offerRetainment).toFixed(0)}`);
            seg.push(`mkP${num(mkt?.clearingPrice).toFixed(2)}`, `mkVol${num(mkt?.totalVolume).toFixed(0)}`, `mkSup${num(mkt?.totalSupply).toFixed(0)}`, `mkUnf${num(mkt?.unfilledDemand).toFixed(0)}`);
            rows.push(seg.join('\t'));
        }
    }
    fs.writeFileSync(OUT, rows.join('\n') + '\n');
    console.log(`done ${rows.length} rows → ${OUT}`);
}

main();
