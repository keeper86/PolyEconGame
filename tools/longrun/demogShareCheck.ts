import fs from 'node:fs';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import type { GameState, Planet } from '../../src/simulation/planet/planet';

const arm = process.argv[2] ?? 'xp13-f1213-s1001';
const state: GameState = deserializeSnapshot(fs.readFileSync(`tools/longrun/results/${arm}/checkpoint.bin`));
const planet = state.planets.values().next().value as Planet;
const tiers = ['none', 'primary', 'secondary', 'tertiary'] as const;
const ex = (v: number): string => v.toExponential(3);

let firstDemog: unknown;
let sumActive = 0;
let sumAllocated = 0;
let sumUsed = 0;
let companies = 0;
const sample: string[] = [];
for (const agent of state.agents.values()) {
    const assets = agent.assets[planet.id] as unknown as Record<string, unknown> | undefined;
    if (assets === undefined || assets === null) {
        continue;
    }
    const demog = assets.workforceDemography as Array<Record<string, Record<string, number>>> | undefined;
    if (demog === undefined) {
        continue;
    }
    if (agent.id === planet.governmentId || agent.id === planet.recycler.id || agent.agentRole !== undefined) {
        continue;
    }
    if (firstDemog === undefined) {
        firstDemog = demog;
    }
    let act = 0;
    for (const cohort of demog) {
        for (const e of tiers) {
            act += Number(cohort[e]?.active ?? 0);
        }
    }
    const alloc = tiers.reduce((s, e) => s + Number((assets.allocatedWorkers as Record<string, number>)?.[e] ?? 0), 0);
    const used = Number(assets.usedWorkers ?? 0);
    sumActive += act;
    sumAllocated += alloc;
    sumUsed += used;
    companies += 1;
    if (sample.length < 6) {
        sample.push(`${agent.id.slice(0, 22).padEnd(23)}active=${ex(act).padStart(10)} alloc=${ex(alloc).padStart(10)} used=${ex(used).padStart(10)} sameObj=${String(firstDemog === demog)}`);
    }
}
console.log(`companies=${companies}`);
for (const line of sample) {
    console.log(`  ${line}`);
}
console.log(`Σ over companies: active=${ex(sumActive)}  allocated=${ex(sumAllocated)}  used=${ex(sumUsed)}`);

const pop = planet.population as unknown as { demography: Array<Record<string, { total: number }>> };
const occTotals: Record<string, number> = {};
for (const cohort of pop.demography) {
    for (const [occ, v] of Object.entries(cohort)) {
        occTotals[occ] = (occTotals[occ] ?? 0) + Number(v?.total ?? 0);
    }
}
console.log(`planet population by occupation: ${Object.entries(occTotals).map(([k, v]) => `${k}=${ex(v)}`).join('  ')}`);
