import fs from 'node:fs';
import path from 'node:path';

import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '../../src/simulation/constants';
import { advanceTick } from '../../src/simulation/engine';
import { queryStorageFacility } from '../../src/simulation/planet/facility';
import type { GameState } from '../../src/simulation/planet/planet';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { setRngState } from '../../src/simulation/utils/stochasticRound';

const CKPT = path.join(__dirname, 'results', '1agent-flow2-6000-8b');
const OUT = path.join(__dirname, 'results', 'refineryProbe.tsv');

function num(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function main(): void {
    const meta = JSON.parse(fs.readFileSync(path.join(CKPT, 'checkpoint.json'), 'utf8')) as { tick: number; rng: [number, number] };
    const gs: GameState = deserializeSnapshot(fs.readFileSync(path.join(CKPT, 'checkpoint.bin')));
    setRngState(meta.rng);
    const planetId = gs.planets.keys().next().value as string;
    const planet = gs.planets.get(planetId) as NonNullable<ReturnType<GameState['planets']['get']>>;
    for (const agent of gs.agents.values()) {
        const assets = agent.assets[planetId];
        for (const facility of assets?.productionFacilities ?? []) {
            if (facility.name === 'Oil Refinery') {
                facility.wasteSurplusTicks = 30;
            }
        }
    }
    const end = Math.round(159.3 * TICKS_PER_YEAR);
    const rows: string[] = [];

    for (let t = meta.tick + 1; t <= end; t++) {
        gs.tick = t;
        advanceTick(gs);
        if (t % TICKS_PER_MONTH !== 0) {
            continue;
        }
        for (const agent of gs.agents.values()) {
            const assets = agent.assets[planetId];
            if (!assets) {
                continue;
            }
            const fac = assets.productionFacilities.find((f: { name: string }) => f.name === 'Oil Refinery');
            if (!fac) {
                continue;
            }
            const mk = assets.market ?? { sell: {}, buy: {} };
            const res = fac.lastTickResults;
            const pid = fac.pidState;
            const mix = fac.productionMix ?? {};
            const last = res?.lastProduced ?? {};
            const seg = [
                String(t),
                (t / TICKS_PER_YEAR).toFixed(3),
                agent.id,
                `dep${num(assets.deposits).toFixed(0)}`,
                `loans${assets.activeLoans.length}`,
                `scale${num(fac.scale).toFixed(1)}`,
                `mx${num(fac.maxScale).toFixed(1)}`,
                `oe${num(res?.overallEfficiency).toFixed(2)}`,
                `workers${num(assets.usedWorkers).toFixed(0)}`,
                `sig${num(pid?.smoothedSignal).toFixed(2)}`,
                `crude${num(queryStorageFacility(assets.storage, 'Crude Oil')).toFixed(0)}`,
            ];
            for (const out of ['Fuel', 'Plastic', 'Chemical']) {
                seg.push(
                    `${out}Mix${num(mix[out]).toFixed(3)}`,
                    `${out}Out${num(last[out]).toFixed(0)}`,
                    `${out}Stor${num(queryStorageFacility(assets.storage, out)).toFixed(0)}`,
                    `${out}Ask${num(mk.sell[out]?.offerPrice ?? mk.sell[out]?.lastOfferPrice).toFixed(2)}`,
                    `${out}Sold${num(mk.sell[out]?.lastSold).toFixed(0)}`,
                    `${out}Placed${num(mk.sell[out]?.lastPlacedQty).toFixed(0)}`,
                );
            }
            for (const out of ['Fuel', 'Plastic', 'Chemical']) {
                const m = planet.lastMarketResult[out];
                seg.push(`${out}mP${num(m?.clearingPrice).toFixed(2)}`, `${out}mD${num(m?.totalDemand).toFixed(0)}`, `${out}mS${num(m?.totalSupply).toFixed(0)}`, `${out}mU${num(m?.unfilledDemand).toFixed(0)}`);
            }
            rows.push(seg.join('\t'));
        }
    }
    fs.writeFileSync(OUT, rows.join('\n') + '\n');
    console.log(`done ${rows.length} rows → ${OUT}`);
}

main();
