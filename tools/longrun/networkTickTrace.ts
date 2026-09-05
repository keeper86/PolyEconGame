import fs from 'node:fs';
import path from 'node:path';

import { TICKS_PER_YEAR } from '../../src/simulation/constants';
import { advanceTick } from '../../src/simulation/engine';
import { queryStorageFacility } from '../../src/simulation/planet/facility';
import type { GameState, MarketResult } from '../../src/simulation/planet/planet';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { setRngState } from '../../src/simulation/utils/stochasticRound';

const CKPT_DIR = path.join(__dirname, 'results', '_sf2-y250-ckpt');
const OUT_FILE = path.join(__dirname, 'results', 'refineryStaffingTicks.tsv');
const RES = ['Maintenance', 'Electronics', 'Plastic', 'Fuel'];
const INPUTS = ['Plastic', 'Electronics', 'Steel'];
const FACNAME = { M: 'Maintenance Facility', E: 'Electronics Factory', R: 'Oil Refinery' } as const;
const OUTNAME = { M: 'Maintenance', E: 'Electronics', R: 'Fuel' } as const;

function arg(name: string): string | undefined {
    const prefix = `--${name}=`;
    return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}
function num(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function main(): void {
    const meta = JSON.parse(fs.readFileSync(path.join(CKPT_DIR, 'checkpoint.json'), 'utf8')) as { rng: [number, number] };
    const gameState: GameState = deserializeSnapshot(fs.readFileSync(path.join(CKPT_DIR, 'checkpoint.bin')));
    setRngState(meta.rng);
    const planetId = gameState.planets.keys().next().value as string;
    const planet = gameState.planets.get(planetId) as NonNullable<ReturnType<GameState['planets']['get']>>;
    const startTick = Math.round(Number(arg('fromYear') ?? 259.55) * TICKS_PER_YEAR);
    const endTick = Math.round(Number(arg('toYear') ?? 260.15) * TICKS_PER_YEAR);

    const rows: string[] = [];
    for (let t = startTick; t <= endTick; t++) {
        gameState.tick = t;
        advanceTick(gameState);
        const c: string[] = [String(t), (t / TICKS_PER_YEAR).toFixed(4)];
        const mr = planet.lastMarketResult;
        for (const res of RES) {
            const m = mr[res] as MarketResult | undefined;
            c.push([m?.clearingPrice, m?.totalVolume, m?.totalDemand, m?.totalSupply, m?.unfilledDemand].map((v) => num(v).toFixed(0)).join('/'));
        }
        for (const [label, facName] of Object.entries(FACNAME)) {
            for (const agent of gameState.agents.values()) {
                const assets = agent.assets[planetId];
                if (!assets) {
                    continue;
                }
                const fac = assets.productionFacilities.find((f: { name: string }) => f.name === facName);
                if (!fac) {
                    continue;
                }
                const mk = assets.market ?? { sell: {}, buy: {} };
                const res = fac.lastTickResults;
                const last = res?.lastProduced ?? {};
                const offer = mk.sell[OUTNAME[label as keyof typeof OUTNAME]];
                const pid = fac.pidState;
                const seg = [
                    label,
                    agent.id.slice(0, 20),
                    `d${num(assets.deposits).toFixed(0)}`,
                    `s${num(fac.scale).toFixed(0)}`,
                    `mx${num(fac.maxScale).toFixed(0)}`,
                    `oe${num(res?.overallEfficiency).toFixed(2)}`,
                    `we${num(res?.workerEfficiency && typeof res.workerEfficiency === 'object' ? Math.min(...Object.values(res.workerEfficiency)) : 0).toFixed(2)}`,
                    `out${num(last[OUTNAME[label as keyof typeof OUTNAME]]).toFixed(0)}`,
                ];
                if (label === 'M') {
                    for (const inp of INPUTS) {
                        seg.push(`st${inp.slice(0, 3)}:${num(queryStorageFacility(assets.storageFacility, inp)).toFixed(0)}`);
                        seg.push(`bp${inp.slice(0, 3)}:${num(mk.buy[inp]?.bidPrice).toFixed(2)}`);
                        seg.push(`lb${inp.slice(0, 3)}:${num(mk.buy[inp]?.lastBought).toFixed(0)}`);
                    }
                    seg.push(`sig${num(pid?.smoothedSignal).toFixed(2)}`, `eI${num(pid?.expansionIntegral).toFixed(1)}`, `cI${num(pid?.contractionIntegral).toFixed(1)}`, `w${num(assets.usedWorkers).toFixed(0)}`);
                }
                if (label === 'R') {
                    seg.push(`stCrude${num(queryStorageFacility(assets.storageFacility, 'Crude Oil')).toFixed(0)}`);
                    seg.push(`bpCrude${num(mk.buy['Crude Oil']?.bidPrice).toFixed(3)}`);
                    seg.push(`lbCrude${num(mk.buy['Crude Oil']?.lastBought).toFixed(0)}`);
                    seg.push(`sig${num(pid?.smoothedSignal).toFixed(2)}`, `eI${num(pid?.expansionIntegral).toFixed(1)}`, `cI${num(pid?.contractionIntegral).toFixed(1)}`, `w${num(assets.usedWorkers).toFixed(0)}`);
                    seg.push(`rev${num(res?.revenue).toFixed(0)}`, `wageCost${num(res?.wageCosts).toFixed(0)}`);
                    const wd = res?.workerEfficiency && typeof res.workerEfficiency === 'object' ? res.workerEfficiency : {};
                    for (const edu of ['none', 'primary', 'secondary', 'tertiary']) {
                        seg.push(`we${edu[0]}${num(wd[edu]).toFixed(2)}`, `wp${edu[0]}${num(assets.wagePerEdu?.[edu]).toFixed(2)}`, `cap${edu[0]}${num(assets.totalSlotCapacity?.[edu]).toFixed(0)}`);
                    }
                }
                seg.push(`ask${num(offer?.offerPrice ?? offer?.lastOfferPrice).toFixed(2)}`, `sold${num(offer?.lastSold).toFixed(0)}`, `placed${num(offer?.lastPlacedQty).toFixed(0)}`);
                c.push(seg.join(' '));
            }
        }
        rows.push(c.join('\t'));
    }
    fs.writeFileSync(OUT_FILE, rows.join('\n') + '\n');
    console.log(`done ${rows.length} ticks → ${OUT_FILE}`);
}

main();
