import fs from 'node:fs';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import type { GameState, Planet } from '../../src/simulation/planet/planet';

const arm = process.argv[2] ?? 'xp13-f1213-s1001';
const nameFilter = process.argv[3] ?? 'mountain-aqua';
const state: GameState = deserializeSnapshot(fs.readFileSync(`tools/longrun/results/${arm}/checkpoint.bin`));
const planet = state.planets.values().next().value as Planet;
const edu = ['none', 'primary', 'secondary', 'tertiary'] as const;
const ex = (v: number): string => v.toExponential(4);

for (const agent of state.agents.values()) {
    if (!agent.id.includes(nameFilter)) {
        continue;
    }
    const assets = agent.assets[planet.id] as unknown as Record<string, unknown>;
    const demog = assets.workforceDemography as Array<Record<string, Record<string, number>>>;
    console.log(`### ${agent.id}  cohorts=${demog.length}`);
    const perTier: Record<string, number> = {};
    const perTierOnb: Record<string, number> = {};
    let perCohortTotal = 0;
    const cohortRows: Array<[number, number]> = [];
    for (let age = 0; age < demog.length; age++) {
        let rowActive = 0;
        for (const e of edu) {
            const cat = demog[age][e] as unknown as Record<string, number | number[]>;
            const a = Number(cat.active ?? 0);
            perTier[e] = (perTier[e] ?? 0) + a;
            rowActive += a;
            perTierOnb[e] = (perTierOnb[e] ?? 0) + (Array.isArray(cat.onboarding) ? cat.onboarding.reduce((s, v) => s + v, 0) : 0);
        }
        perCohortTotal += rowActive;
        if (rowActive > 0) {
            cohortRows.push([age, rowActive]);
        }
    }
    console.log(`per-tier active: ${edu.map((e) => `${e}=${ex(perTier[e] ?? 0)}`).join('  ')}`);
    console.log(`per-tier onboarding: ${edu.map((e) => `${e}=${ex(perTierOnb[e] ?? 0)}`).join('  ')}`);
    console.log(`Σ cohorts = ${ex(perCohortTotal)}   non-empty cohorts = ${cohortRows.length}`);
    const sorted = [...cohortRows].sort((a, b) => b[1] - a[1]).slice(0, 6);
    console.log(`largest cohorts: ${sorted.map(([a, v]) => `age${a}=${ex(v)}`).join('  ')}`);
    console.log(
        `allocatedWorkers: ${Object.entries(assets.allocatedWorkers as Record<string, number>).map(([k, v]) => `${k}=${ex(v)}`).join('  ')}`,
    );
    console.log(
        `totalSlotCapacity: ${Object.entries(assets.totalSlotCapacity as Record<string, number>).map(([k, v]) => `${k}=${ex(v)}`).join('  ')}`,
    );
    const m = assets.monthAcc as Record<string, number>;
    console.log(`monthAcc: wages=${ex(m.wages)} workerTicks=${ex(m.totalWorkersTicks)} revenue=${ex(m.revenue)} claims=${ex(m.claimPayments)}`);
    break;
}
