import fs from 'node:fs';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { updateProductionCostFloors } from '../../src/simulation/planet/production';
import { facilityInputCostPerTick } from '../../src/simulation/planet/auxiliaryCosts';
import { ALL_PRODUCTION_FACILITY_ENTRIES } from '../../src/simulation/planet/productionFacilities';
import type { ProductionFacility } from '../../src/simulation/planet/facility';
import type { GameState, Planet } from '../../src/simulation/planet/planet';
import { MIN_WAGE, THEORETICAL_WAGE_CEILING_MARGIN, WAGE_SHARE } from '../../src/simulation/constants';

const arm = process.argv[2] ?? 'clean100';
const state: GameState = deserializeSnapshot(fs.readFileSync(`tools/longrun/results/${arm}/checkpoint.bin`));
const planet = state.planets.values().next().value as Planet;
updateProductionCostFloors(planet);

const ignitionCeiling = MIN_WAGE / WAGE_SHARE;
const f = (v: number, digits = 3): string => (!Number.isFinite(v) ? 'n/a' : v.toFixed(digits));

type Row = {
    name: string;
    level: string;
    workers: number;
    outputValue: number;
    inputCost: number;
    valueAddPerWorker: number;
    ceiling: number;
    employment: number;
};

const rows: Row[] = [];
for (const { template, primaryOutputLevel } of Object.values(ALL_PRODUCTION_FACILITY_ENTRIES)) {
    const workers = Object.values(template.workerRequirement).reduce((sum, n) => sum + (n ?? 0), 0);
    if (workers <= 0) {
        continue;
    }
    let outputValue = 0;
    for (const output of template.produces) {
        outputValue += output.quantity * (planet.marketPrices[output.resource.name] ?? 0);
    }
    const inputCost = facilityInputCostPerTick(template, planet);
    rows.push({
        name: template.name,
        level: primaryOutputLevel,
        workers,
        outputValue,
        inputCost,
        valueAddPerWorker: (outputValue - inputCost) / workers,
        ceiling: planet.theoreticalWageCeilings[template.name] ?? 0,
        employment: 0,
    });
}

const byName = new Map(rows.map((row) => [row.name, row]));
let requiredWorkers = 0;
for (const agent of state.agents.values()) {
    const assets = agent.assets[planet.id];
    if (!assets) {
        continue;
    }
    for (const facility of assets.productionFacilities as ProductionFacility[]) {
        const row = byName.get(facility.name);
        if (!row) {
            continue;
        }
        const scale = facility.scale > 0 ? facility.scale : 0;
        row.employment += scale * row.workers;
        requiredWorkers += scale * row.workers;
    }
}

const weighted = (pick: (row: Row) => number): number =>
    requiredWorkers > 0 ? rows.reduce((sum, row) => sum + row.employment * pick(row), 0) / requiredWorkers : 0;

const belowIgnition = rows.filter((row) => row.employment > 0 && row.valueAddPerWorker * THEORETICAL_WAGE_CEILING_MARGIN < ignitionCeiling);
const belowEmployment = belowIgnition.reduce((sum, row) => sum + row.employment, 0);
const meanCeiling = weighted((row) => row.ceiling);
const meanValueAdd = weighted((row) => row.valueAddPerWorker);

console.log(`### ${arm}  (MIN_WAGE=${MIN_WAGE}, WAGE_SHARE=${WAGE_SHARE}, margin=${THEORETICAL_WAGE_CEILING_MARGIN})`);
console.log(`    ignition needs valueAdd/worker > ${f(ignitionCeiling)} (ceiling > ${f(ignitionCeiling)})`);
console.log(`    employment-weighted: valueAdd/worker=${f(meanValueAdd)}  ceiling=${f(meanCeiling)}`);
console.log(`    uniform crew factor for ignition: k = ${f(ignitionCeiling / meanCeiling)}  (theoretical optimum k=${f(ignitionCeiling / meanCeiling)})`);
console.log(`    required workers=${requiredWorkers.toExponential(3)}  below-ignition employment=${((belowEmployment / requiredWorkers) * 100).toFixed(1)}%`);
console.log('');
const aboveEmployment = requiredWorkers - belowEmployment;
console.log(`    above-ignition employment=${((aboveEmployment / requiredWorkers) * 100).toFixed(1)}%`);
console.log('');
console.log('level        workers/scale  outValue   inCost  out/in  vAdd/work   ceiling  employment   template');
for (const row of [...rows].sort((a, b) => b.employment - a.employment)) {
    if (row.employment <= 0) {
        continue;
    }
    const ratio = row.inputCost > 0 ? row.outputValue / row.inputCost : Number.POSITIVE_INFINITY;
    console.log(
        `${row.level.padEnd(12)} ${String(row.workers).padStart(13)} ${f(row.outputValue, 2).padStart(9)} ` +
            `${f(row.inputCost, 2).padStart(8)} ${(Number.isFinite(ratio) ? f(ratio) : 'inf').padStart(6)} ` +
            `${f(row.valueAddPerWorker).padStart(10)} ${f(row.ceiling).padStart(9)} ` +
            `${row.employment.toExponential(2).padStart(11)}   ${row.name}`,
    );
}
const idle = rows.filter((row) => row.employment <= 0);
console.log(`\nno operating instance: ${idle.map((row) => row.name).join(', ') || '(none)'}`);
