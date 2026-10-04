import fs from 'node:fs';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import {
    auxiliaryCostRates,
    auxiliaryCostPerTick,
    facilityInputCostPerTick,
    facilityWageCostPerTick,
    storageScaleForFacility,
} from '../../src/simulation/planet/auxiliaryCosts';
import { ESTIMATED_HR_OVERHEAD, PRODUCED_HR_QUANTITY, PRODUCED_STORAGE_QUANTITY } from '../../src/simulation/planet/specialFacilities';
import { TICKS_PER_MONTH } from '../../src/simulation/constants';
import type { Planet, GameState } from '../../src/simulation/planet/planet';
import type { Facility } from '../../src/simulation/planet/facility';

const arm = process.argv[2] ?? 'xp13-f1213-s1001';
const state: GameState = deserializeSnapshot(fs.readFileSync(`tools/longrun/results/${arm}/checkpoint.bin`));
const planet = state.planets.values().next().value as Planet;
const rates = auxiliaryCostRates(planet);
const workers = (f: Facility): number =>
    (f.workerRequirement.none ?? 0) + (f.workerRequirement.primary ?? 0) +
    (f.workerRequirement.secondary ?? 0) + (f.workerRequirement.tertiary ?? 0);
const f = (v: number): string => (!Number.isFinite(v) ? 'n/a' : Math.abs(v) >= 1e4 ? v.toExponential(2) : v.toFixed(3));

console.log(`aux rates: hrCostPerWorker=${f(rates.hrCostPerWorker)} storageCostPerScale=${f(rates.storageCostPerScale)} ` +
    `maintenanceCostPerScale=${f(rates.maintenanceCostPerScale)} constructionServicePrice=${f(rates.constructionServicePrice)}`);

type Row = { type: string; direct: number; agent: number; dept: number; out: number; netWorthish: number };
const table: Row[] = [];

for (const agent of state.agents.values()) {
    const assets = agent.assets[planet.id];
    if (!assets) continue;
    if (agent.id === planet.governmentId || agent.id === planet.recycler.id || agent.agentRole !== undefined) continue;
    let out = 0;
    let direct = 0;
    let theoreticalAux = 0;
    let neededHr = 0;
    let neededStorage = 0;
    let type = '';
    for (const fac of assets.productionFacilities) {
        const tick = fac.lastTickResults;
        if (!tick || fac.produces.length === 0) continue;
        const qty = fac.produces[0].quantity * fac.scale * (tick.overallEfficiency ?? 0);
        if (qty <= 0) continue;
        out += qty;
        direct += tick.wageCosts + tick.inputCosts;
        theoreticalAux += auxiliaryCostPerTick(fac, rates);
        neededHr += workers(fac) * ESTIMATED_HR_OVERHEAD;
        neededStorage += storageScaleForFacility(fac);
        type = fac.name;
    }
    if (out <= 0) continue;
    const acc = assets.monthAcc;
    const totalCost = acc.wages + acc.purchases + acc.claimPayments;
    table.push({
        type,
        direct: direct / out,
        agent: totalCost / out / TICKS_PER_MONTH,
        dept: 0,
        out,
        netWorthish: totalCost / TICKS_PER_MONTH / out - direct / out,
    });

    if (type === 'Water Facility') {
        const hr = assets.humanResourcesDepartment;
        const storage = assets.storage?.department;
        console.log(`\n=== WATER COMPANY ===`);
        console.log(`output/tick=${f(out)}  direct/unit=${f(direct / out)}  agent/unit=${f(totalCost / out / TICKS_PER_MONTH)}`);
        console.log(`theoretical aux/unit=${f(theoreticalAux / out)} (share of direct ${f((100 * theoreticalAux) / direct, 0)}%)`);
        console.log(`HR dept: scale=${f(hr?.scale ?? Number.NaN)} max=${f(hr?.maxScale ?? Number.NaN)} workers=${hr ? workers(hr) : 'n/a'} ` +
            `producedHR/tick=${f((hr?.scale ?? 0) * PRODUCED_HR_QUANTITY)} neededHR/tick=${f(neededHr)} ratio=${f((hr?.scale ?? 0) * PRODUCED_HR_QUANTITY / Math.max(1, neededHr))}`);
        console.log(`storage dept: scale=${f(storage?.scale ?? Number.NaN)} max=${f(storage?.maxScale ?? Number.NaN)} workers=${storage ? workers(storage) : 'n/a'} ` +
            `producedStorage/tick=${f((storage?.scale ?? 0) * PRODUCED_STORAGE_QUANTITY)} neededStorage/tick=${f(neededStorage)} ratio=${f((storage?.scale ?? 0) * PRODUCED_STORAGE_QUANTITY / Math.max(1, neededStorage))}`);
        console.log(`monthAcc: revenue=${f(acc.revenue)} wages=${f(acc.wages)} purchases=${f(acc.purchases)} claims=${f(acc.claimPayments)} deposits=${f(assets.deposits)}`);
        let deptCost = 0;
        for (const fac of [hr, storage].filter((x): x is Facility => Boolean(x))) {
            const t = fac.lastTickResults as unknown as Record<string, number> | undefined;
            const c = (t?.wageCosts ?? 0) + (t?.inputCosts ?? 0);
            deptCost += c;
            console.log(`  ${fac.name}: wageCosts=${f(t?.wageCosts ?? 0)} inputCosts=${f(t?.inputCosts ?? 0)} cost/unitOfOutput=${f(c / out)} (${f((100 * c) / Math.max(1, direct), 0)}% of direct)`);
        }
        console.log(`dept layer total/unit=${f(deptCost / out)}  interest: loans=${f(assets.activeLoans.reduce((s, l) => s + l.remainingPrincipal, 0))}`);
    }
}

console.log(`\n=== overhead multiple by facility type (agent cost/unit ÷ direct cost/unit) ===`);
console.log('type                        direct/unit  agent/unit   multiple');
for (const r of table.sort((a, b) => b.agent / b.direct - a.agent / a.direct)) {
    console.log(`${r.type.padEnd(28)}${f(r.direct).padStart(11)}${f(r.agent).padStart(12)}${f(r.agent / r.direct).padStart(11)}`);
}
