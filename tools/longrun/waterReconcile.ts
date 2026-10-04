import fs from 'node:fs';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { TICKS_PER_MONTH } from '../../src/simulation/constants';
import type { Planet, GameState } from '../../src/simulation/planet/planet';

const arm = process.argv[2] ?? 'xp13-f1213-s1001';
const nameFilter = process.argv[3] ?? 'mountain-aqua';
const state: GameState = deserializeSnapshot(fs.readFileSync(`tools/longrun/results/${arm}/checkpoint.bin`));
const planet = state.planets.values().next().value as Planet;
const f = (v: number): string => (!Number.isFinite(v) ? 'n/a' : Math.abs(v) >= 1e4 ? v.toExponential(3) : v.toFixed(3));

for (const agent of state.agents.values()) {
    if (!agent.id.includes(nameFilter)) {
        continue;
    }
    const assets = agent.assets[planet.id];
    if (!assets) {
        continue;
    }
    console.log(`### ${agent.id}`);
    let facWages = 0;
    let facInputs = 0;
    const seen = new Set<string>();
    const dump = (fac: Record<string, unknown>, label: string): void => {
        const key = String(fac.id ?? fac.name);
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        const tick = (fac.lastTickResults ?? {}) as Record<string, number>;
        const w = tick.wageCosts ?? 0;
        const i = tick.inputCosts ?? 0;
        facWages += w;
        facInputs += i;
        const active = fac.active === false ? 'INACTIVE' : '';
        console.log(
            `  ${label.padEnd(22)}${String(fac.name).padEnd(26)}scale=${f(Number(fac.scale ?? 0)).padStart(10)} ` +
                `wage=${f(w).padStart(10)} input=${f(i).padStart(10)} ${active}`,
        );
    };
    for (const [key, value] of Object.entries(assets as unknown as Record<string, unknown>)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                if (item && typeof item === 'object' && 'name' in item && 'scale' in item) {
                    dump(item as Record<string, unknown>, key);
                }
            }
        } else if (value && typeof value === 'object' && 'name' in value && 'scale' in value) {
            dump(value as Record<string, unknown>, key);
        }
    }
    const acc = assets.monthAcc;
    console.log(`\n  facility layer /tick: wages=${f(facWages)} inputs=${f(facInputs)} total=${f(facWages + facInputs)}`);
    console.log(
        `  monthAcc /tick:       wages=${f(acc.wages / TICKS_PER_MONTH)} purchases=${f(acc.purchases / TICKS_PER_MONTH)} ` +
            `claims=${f(acc.claimPayments / TICKS_PER_MONTH)} revenue=${f(acc.revenue / TICKS_PER_MONTH)}`,
    );
    const gap =
        (acc.wages + acc.purchases + acc.claimPayments) / TICKS_PER_MONTH - (facWages + facInputs);
    console.log(`  UNEXPLAINED gap/tick = ${f(gap)}  (= ${f((100 * gap) / Math.max(1, (acc.wages + acc.purchases + acc.claimPayments) / TICKS_PER_MONTH), 0)}% of total outlays)`);
    const loans = assets.activeLoans;
    const principal = loans.reduce((s, l) => s + l.remainingPrincipal, 0);
    console.log(`  loans: n=${loans.length} principal=${f(principal)} types=${[...new Set(loans.map((l) => l.type))].join(',')}`);
    console.log(`  loan fields: ${Object.keys(loans[0] ?? {}).join(',')}`);
    console.log(`  deposits=${f(assets.deposits)}  usedWorkers=${f(assets.usedWorkers)}  allocatedWorkers=${JSON.stringify(assets.allocatedWorkers)}`);
}
