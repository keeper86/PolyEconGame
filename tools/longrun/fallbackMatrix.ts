import fs from 'node:fs';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import type { GameState, Planet } from '../../src/simulation/planet/planet';

const arm = process.argv[2] ?? 'xp13-f1213-s1001';
const nameFilter = process.argv[3] ?? 'mountain-aqua';
const state: GameState = deserializeSnapshot(fs.readFileSync(`tools/longrun/results/${arm}/checkpoint.bin`));
const planet = state.planets.values().next().value as Planet;
const tiers = ['none', 'primary', 'secondary', 'tertiary'] as const;
const ex = (v: number): string => v.toExponential(3);

for (const agent of state.agents.values()) {
    if (!agent.id.includes(nameFilter)) {
        continue;
    }
    const assets = agent.assets[planet.id] as unknown as Record<string, unknown>;
    const facilities = assets.productionFacilities as Array<Record<string, unknown>>;
    const exact: Record<string, number> = {};
    const over: Record<string, number> = {};
    const rows: string[] = [];
    for (const fac of facilities) {
        const tick = (fac.lastTickResults ?? {}) as Record<string, unknown>;
        const exactByEdu = (tick.exactUsedByEdu ?? {}) as Record<string, number>;
        const overByJob = (tick.overqualifiedWorkers ?? {}) as Record<string, Record<string, number>>;
        for (const job of tiers) {
            exact[job] = (exact[job] ?? 0) + Number(exactByEdu[job] ?? 0);
            for (const worker of tiers) {
                const n = Number(overByJob[job]?.[worker] ?? 0);
                if (n > 0) {
                    const key = `${job} <- ${worker}`;
                    over[key] = (over[key] ?? 0) + n;
                    rows.push(`${(fac.name as string).slice(0, 18).padEnd(19)}${key.padEnd(22)}${ex(n)}`);
                }
            }
        }
    }
    const cap = assets.totalSlotCapacity as Record<string, number>;
    console.log(`### ${agent.id}`);
    console.log(`slot capacity by job tier: ${tiers.map((t) => `${t}=${ex(cap[t] ?? 0)}`).join('  ')}`);
    console.log(`exact fills by job tier:   ${tiers.map((t) => `${t}=${ex(exact[t] ?? 0)}`).join('  ')}`);
    console.log(`cross-tier (overqualified) fills, by job <- worker tier:`);
    for (const [k, v] of Object.entries(over).sort((a, b) => b[1] - a[1])) {
        console.log(`   ${k.padEnd(22)}${ex(v)}`);
    }
    if (rows.length === 0) {
        console.log('   (none reported)');
    }
    break;
}
