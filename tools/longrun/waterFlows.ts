import fs from 'node:fs';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { TICKS_PER_MONTH } from '../../src/simulation/constants';
import type { GameState, Planet } from '../../src/simulation/planet/planet';

const arm = process.argv[2] ?? 'xp13-f1213-s1001';
const nameFilter = process.argv[3] ?? 'mountain-aqua';
const state: GameState = deserializeSnapshot(fs.readFileSync(`tools/longrun/results/${arm}/checkpoint.bin`));
const planet = state.planets.values().next().value as Planet;
const tiers = ['none', 'primary', 'secondary', 'tertiary'] as const;
const ex = (v: number): string =>
    !Number.isFinite(v) ? 'n/a' : Math.abs(v) >= 1e4 ? v.toExponential(3) : v.toFixed(2);
const sum = (a: number[] | undefined): number => (Array.isArray(a) ? a.reduce((s, v) => s + v, 0) : 0);

for (const agent of state.agents.values()) {
    if (!agent.id.includes(nameFilter)) {
        continue;
    }
    const assets = agent.assets[planet.id] as unknown as Record<string, unknown>;
    const demog = assets.workforceDemography as Array<Record<string, Record<string, number | number[]>>>;
    console.log(`### ${agent.id}`);
    console.log(
        'tier      active      onboard(Σ)  newestHire  fired(Σ)   newestFire  volQuit(Σ)  retir(Σ)   target      gap         gapActive    decision',
    );
    for (const tier of tiers) {
        let active = 0;
        let onb = 0;
        let fired = 0;
        let vol = 0;
        let ret = 0;
        let newestHire = 0;
        let newestFire = 0;
        for (const cohort of demog) {
            const cat = cohort[tier];
            if (cat === undefined) {
                continue;
            }
            const a = Number(cat.active ?? 0);
            active += a;
            const o = (cat.onboarding ?? []) as number[];
            const f = (cat.departingFired ?? []) as number[];
            const v = (cat.voluntaryDeparting ?? []) as number[];
            const r = (cat.departingRetired ?? []) as number[];
            onb += sum(o);
            fired += sum(f);
            vol += sum(v);
            ret += sum(r);
            newestHire += o.length > 0 ? o[o.length - 1] : 0;
            newestFire += f.length > 0 ? f[f.length - 1] : 0;
        }
        const target = Number((assets.allocatedWorkers as Record<string, number>)[tier] ?? 0);
        const currentActive = active + onb;
        const gap = target - currentActive;
        const gapActive = target - active;
        const canFire = gapActive < -active * 0.05;
        const decision = gap > 0 ? 'HIRE' : canFire ? 'FIRE' : 'idle';
        const perTickCap = (active * 0.05) / TICKS_PER_MONTH;
        console.log(
            `${tier.padEnd(10)}${ex(active).padStart(10)}${ex(onb).padStart(12)}${ex(newestHire).padStart(12)}` +
                `${ex(fired).padStart(10)}${ex(newestFire).padStart(12)}${ex(vol).padStart(12)}${ex(ret).padStart(10)}` +
                `${ex(target).padStart(11)}${ex(gap).padStart(12)}${ex(gapActive).padStart(12)}  ${decision.padEnd(5)} firecap/tick=${ex(perTickCap)}`,
        );
    }
    const m = assets.monthAcc as Record<string, number>;
    console.log(
        `monthAcc: wages=${ex(m.wages)} workerTicks=${ex(m.totalWorkersTicks)}  → workers/tick=${ex(m.totalWorkersTicks / TICKS_PER_MONTH)}`,
    );
    break;
}
