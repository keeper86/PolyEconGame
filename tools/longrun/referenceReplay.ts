import fs from 'node:fs';
import path from 'node:path';

import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '../../src/simulation/constants';
import { advanceTick } from '../../src/simulation/engine';
import type { GameState } from '../../src/simulation/planet/planet';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { setRngState } from '../../src/simulation/utils/stochasticRound';
import { sampleMetrics } from './metrics';

const CKPT = path.join(__dirname, 'results', '1agent-flow2-6000-10m');
const OUT = path.join(__dirname, 'results', 'referenceReplay.tsv');

function num(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function main(): void {
    const meta = JSON.parse(fs.readFileSync(path.join(CKPT, 'checkpoint.json'), 'utf8')) as { tick: number; rng: [number, number] };
    const gs: GameState = deserializeSnapshot(fs.readFileSync(path.join(CKPT, 'checkpoint.bin')));
    setRngState(meta.rng);
    const end = meta.tick + 15 * TICKS_PER_YEAR;
    const rows: string[] = [];

    for (let t = meta.tick + 1; t <= end; t++) {
        gs.tick = t;
        advanceTick(gs);
        if (t % TICKS_PER_MONTH !== 0) {
            continue;
        }
        const m = sampleMetrics(gs);
        rows.push(
            [
                String(t),
                (t / TICKS_PER_YEAR).toFixed(2),
                `${num(m.totalPopulation).toFixed(0)}`,
                `${num(m.avgFacilityCondition).toFixed(5)}`,
                `${num(m.avgWorkerEfficiency).toFixed(4)}`,
                `${num(m.workerUtilization).toFixed(4)}`,
                `${num(m.fuelPrice ?? 0).toFixed(3)}`,
                `${num(m.plasticPrice ?? 0).toFixed(3)}`,
                `${num(m.constructionEmploymentShare).toFixed(5)}`,
                `${num(m.avgGroceryStarvation).toFixed(5)}`,
            ].join('\t'),
        );
    }
    fs.writeFileSync(OUT, rows.join('\n') + '\n');
    console.log(`done ${rows.length} rows → ${OUT}`);
}

main();
