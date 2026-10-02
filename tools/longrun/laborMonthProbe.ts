import fs from 'node:fs';
import path from 'node:path';

import { TICKS_PER_MONTH } from '../../src/simulation/constants';
import { advanceTick } from '../../src/simulation/engine';
import type { GameState } from '../../src/simulation/planet/planet';
import { educationLevelKeys } from '../../src/simulation/population/education';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { setRngState } from '../../src/simulation/utils/stochasticRound';

const outDir = process.argv[2];
if (!outDir) {
    throw new Error('usage: laborMonthProbe.ts <results-dir>');
}
const OUT = path.join(outDir, 'laborMonthProbe.tsv');
const TICKS = Number(process.env.LABOR_TICKS ?? 62);

function main(): void {
    const meta = JSON.parse(fs.readFileSync(path.join(outDir, 'checkpoint.json'), 'utf8')) as {
        tick: number;
        rng: [number, number];
    };
    const gs: GameState = deserializeSnapshot(fs.readFileSync(path.join(outDir, 'checkpoint.bin')));
    setRngState(meta.rng);
    const planetId = gs.planets.keys().next().value as string;
    const planet = gs.planets.get(planetId)!;
    const rows: string[] = [];

    for (let k = 0; k < TICKS; k++) {
        gs.tick = meta.tick + 1 + k;
        advanceTick(gs);

        let active = 0;
        let departing = 0;
        let onboarding = 0;
        let quitsThisMonth = 0;
        let wageMin = Number.POSITIVE_INFINITY;
        let wageMax = 0;
        let wageSum = 0;
        let wageCount = 0;
        for (const agent of gs.agents.values()) {
            const a = agent.assets[planetId];
            if (!a?.workforceDemography) {
                continue;
            }
            for (const edu of educationLevelKeys) {
                quitsThisMonth += a._monthlyVoluntaryQuits?.[edu] ?? 0;
                const w = a.wagePerEdu[edu] ?? 0;
                if (w > 0) {
                    if (w < wageMin) {
                        wageMin = w;
                    }
                    if (w > wageMax) {
                        wageMax = w;
                    }
                    wageSum += w;
                    wageCount += 1;
                }
            }
            for (const cohort of a.workforceDemography) {
                for (const edu of educationLevelKeys) {
                    const c = cohort[edu];
                    active += c.active;
                    for (const q of c.voluntaryDeparting) {
                        departing += q;
                    }
                    for (const o of c.onboarding) {
                        onboarding += o;
                    }
                }
            }
        }

        let unoccupied = 0;
        for (const cohort of planet.population.demography) {
            for (const edu of educationLevelKeys) {
                unoccupied += cohort.unoccupied[edu].total;
            }
        }

        rows.push(
            [
                gs.tick,
                gs.tick % TICKS_PER_MONTH,
                active.toFixed(0),
                departing.toFixed(0),
                onboarding.toFixed(0),
                quitsThisMonth.toFixed(0),
                unoccupied.toFixed(0),
                (Number.isFinite(wageMin) ? wageMin : 0).toFixed(4),
                wageMax.toFixed(4),
                (wageCount > 0 ? wageSum / wageCount : 0).toFixed(4),
            ].join('\t'),
        );
    }

    fs.writeFileSync(
        OUT,
        [
            'tick',
            'dayOfMonth',
            'active',
            'voluntaryDepartingStock',
            'onboardingStock',
            'quitsThisMonth',
            'unoccupied',
            'wageMin',
            'wageMax',
            'wageMean',
        ].join('\t') +
            '\n' +
            rows.join('\n') +
            '\n',
    );
    console.log(`done ${rows.length} ticks -> ${OUT}`);
}

main();
