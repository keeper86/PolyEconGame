import fs from 'node:fs';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { TICKS_PER_MONTH } from '../../src/simulation/constants';
import type { Planet, GameState } from '../../src/simulation/planet/planet';

const arm = process.argv[2] ?? 'xp13-f1213-s1001';
const nameFilter = process.argv[3] ?? 'mountain-aqua';
const state: GameState = deserializeSnapshot(fs.readFileSync(`tools/longrun/results/${arm}/checkpoint.bin`));
const planet = state.planets.values().next().value as Planet;
const e = (v: number): string => v.toExponential(4);
const edu = ['none', 'primary', 'secondary', 'tertiary'] as const;

for (const agent of state.agents.values()) {
    if (!agent.id.includes(nameFilter)) {
        continue;
    }
    const assets = agent.assets[planet.id];
    if (!assets) {
        continue;
    }
    console.log(`### ${agent.id}   planet wagePerEdu=${JSON.stringify(planet.wagePerEdu)}`);

    const fac = assets.productionFacilities[0];
    const req = fac.workerRequirement as Record<string, number>;
    const reqSum = edu.reduce((s, l) => s + (req[l] ?? 0), 0);
    const tick = fac.lastTickResults as unknown as Record<string, unknown>;
    const usedByEdu = (tick.totalUsedByEdu ?? {}) as Record<string, number>;

    let templatePayroll = 0;
    for (const l of edu) {
        templatePayroll += (req[l] ?? 0) * fac.scale * (planet.wagePerEdu[l] ?? 0);
    }

    const slotCap = edu.reduce((s, l) => s + (assets.totalSlotCapacity?.[l] ?? 0), 0);
    const usedSlot = edu.reduce((s, l) => s + (usedByEdu[l] ?? 0), 0);
    const alloc = edu.reduce((s, l) => s + (assets.allocatedWorkers?.[l] ?? 0), 0);

    let act = 0;
    let onb = 0;
    let dep = 0;
    for (const cohort of assets.workforceDemography) {
        for (const l of edu) {
            const c = cohort[l] as unknown as Record<string, number[] | number>;
            act += Number(c.active ?? 0);
            onb += (c.onboarding as number[] | undefined)?.reduce((s, v) => s + v, 0) ?? 0;
            dep += (c.voluntaryDeparting as number[] | undefined)?.reduce((s, v) => s + v, 0) ?? 0;
            dep += (c.departingFired as number[] | undefined)?.reduce((s, v) => s + v, 0) ?? 0;
            dep += (c.departingRetired as number[] | undefined)?.reduce((s, v) => s + v, 0) ?? 0;
        }
    }

    const m = assets.monthAcc;
    console.log(`facility: ${fac.name} scale=${e(fac.scale)}  workerRequirement=${JSON.stringify(req)}  Σreq=${reqSum}`);
    console.log(`  (a) template × scale          = ${e(reqSum * fac.scale)} worker-units  → template payroll/tick = ${e(templatePayroll)}`);
    console.log(`  (b) sim slot capacity (bodies)= ${e(slotCap)}`);
    console.log(`  (c) used by edu (bodies)      = ${e(usedSlot)}    assets.usedWorkers = ${e(assets.usedWorkers)}`);
    console.log(`  (d) allocatedWorkers target   = ${e(alloc)}`);
    console.log(`  (e) demography active         = ${e(act)}   onboarding=${e(onb)} departing=${e(dep)}`);
    console.log(`  (f) payroll charge/tick       = ${e(m.totalWorkersTicks / TICKS_PER_MONTH)}   (monthAcc.wages ${e(m.wages)})`);
    console.log(`  facility wageCosts/tick       = ${e(Number(tick.wageCosts ?? 0))}  inputCosts/tick = ${e(Number(tick.inputCosts ?? 0))}`);
    console.log(`  ratios: (f)/(c)=${(m.totalWorkersTicks / TICKS_PER_MONTH / assets.usedWorkers).toFixed(2)}  (f)/(e)=${(m.totalWorkersTicks / TICKS_PER_MONTH / act).toFixed(2)}  (f)/(a)=${(m.totalWorkersTicks / TICKS_PER_MONTH / (reqSum * fac.scale)).toFixed(2)}  (a)/(c)=${(reqSum * fac.scale / assets.usedWorkers).toFixed(2)}`);
    console.log(`  facility layer wages/used worker = ${(Number(tick.wageCosts ?? 0) / assets.usedWorkers).toFixed(3)}   (wage 1.0 expected)`);
}
