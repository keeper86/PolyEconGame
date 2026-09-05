import fs from 'node:fs';
import path from 'node:path';

import { TICKS_PER_YEAR } from '../../src/simulation/constants';
import { advanceTick } from '../../src/simulation/engine';
import { queryStorageFacility } from '../../src/simulation/planet/facility';
import type { GameState } from '../../src/simulation/planet/planet';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { setRngState } from '../../src/simulation/utils/stochasticRound';

const CKPT = path.join(__dirname, 'results', '1agent-flare-6000-8b');
const OUT = path.join(__dirname, 'results', 'chemGateTrace.tsv');

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
                facility.wasteSurplusTicks = 120;
            }
        }
    }
    const startTick = meta.tick + 1;
    const sampleFrom = Math.round(100.35 * TICKS_PER_YEAR);
    const end = Math.round(100.45 * TICKS_PER_YEAR);
    const rows: string[] = [];

    for (let t = startTick; t <= end; t++) {
        gs.tick = t;
        advanceTick(gs);
        if (t < sampleFrom) {
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
            const mk = assets.market ?? { sell: {}, buy: {} };
            const pid = fac.pidState;
            const mix = fac.productionMix ?? {};
            const res = fac.lastTickResults;
            const last = res?.lastProduced ?? {};
            const seg: string[] = [String(t), (t / TICKS_PER_YEAR).toFixed(4)];
            const wmap = (res?.workerEfficiency ?? {}) as Record<string, number>;
            const wvals = Object.values(wmap);
            const crudeEff = (res?.resourceEfficiency ?? {})['Crude Oil'];
            seg.push(
                `oe${num(res?.overallEfficiency).toFixed(3)}`,
                `we${wvals.length ? num(Math.min(...wvals)).toFixed(3) : 'none'}`,
                `crudeEff${crudeEff === undefined ? 'none' : num(crudeEff).toFixed(3)}`,
                `cond${num(fac.maintenanceStatus).toFixed(3)}`,
                `crude${num(queryStorageFacility(assets.storageFacility, 'Crude Oil')).toFixed(0)}`,
            );
            for (const out of ['Fuel', 'Plastic', 'Chemical']) {
                const entry = assets.storageFacility.currentInStorage[out];
                seg.push(
                    `${out}m${num(mix[out]).toFixed(3)}`,
                    `${out}out${num(last[out]).toFixed(0)}`,
                    `${out}stor${num(queryStorageFacility(assets.storageFacility, out)).toFixed(0)}`,
                    `${out}tot${num(entry?.quantity ?? 0).toFixed(0)}`,
                    `${out}sold${num(mk.sell[out]?.lastSold).toFixed(0)}`,
                    `${out}placed${num(mk.sell[out]?.lastPlacedQty).toFixed(0)}`,
                    `${out}ask${num(mk.sell[out]?.offerPrice ?? mk.sell[out]?.lastOfferPrice).toFixed(2)}`,
                );
            }
            seg.push(`sig${num(pid?.smoothedSignal).toFixed(2)}`);
            rows.push(seg.join('\t'));
        }
    }
    fs.writeFileSync(OUT, rows.join('\n') + '\n');
    console.log(`done ${rows.length} rows → ${OUT}`);
}

main();
