import fs from 'node:fs';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { updateProductionCostFloors } from '../../src/simulation/planet/production';
import { auxiliaryCostPerTick, auxiliaryCostRates, facilityInputCostPerTick } from '../../src/simulation/planet/auxiliaryCosts';
import { ALL_PRODUCTION_FACILITY_ENTRIES } from '../../src/simulation/planet/productionFacilities';
import type { ProductionFacility } from '../../src/simulation/planet/facility';
import type { EducationLevelType } from '../../src/simulation/population/education';
import type { GameState, Planet } from '../../src/simulation/planet/planet';
import { MIN_WAGE, WAGE_SHARE } from '../../src/simulation/constants';

const arm = process.argv[2] ?? 'clean100';
const state: GameState = deserializeSnapshot(fs.readFileSync(`tools/longrun/results/${arm}/checkpoint.bin`));
const planet = state.planets.values().next().value as Planet;
updateProductionCostFloors(planet);
const rates = auxiliaryCostRates(planet);
const f = (v: number, digits = 3): string => (!Number.isFinite(v) ? 'n/a' : v.toFixed(digits));

type Row = {
    name: string;
    level: string;
    crew: number;
    outQty: number;
    inQty: number;
    materials: number;
    wages: number;
    aux: number;
    total: number;
    outValue: number;
    employment: number;
};

const rows: Row[] = [];
for (const { template, primaryOutputLevel } of Object.values(ALL_PRODUCTION_FACILITY_ENTRIES)) {
    const crew = Object.values(template.workerRequirement).reduce((sum, n) => sum + (n ?? 0), 0);
    if (crew <= 0) {
        continue;
    }
    let outValue = 0;
    let outQty = 0;
    for (const output of template.produces) {
        outValue += output.quantity * (planet.marketPrices[output.resource.name] ?? 0);
        outQty += output.quantity;
    }
    const materials = facilityInputCostPerTick(template, planet);
    const wages = Object.entries(template.workerRequirement).reduce(
        (sum, [edu, requirement]) => sum + (requirement ?? 0) * (planet.wagePerEdu[edu as EducationLevelType] ?? 0),
        0,
    );
    const aux = auxiliaryCostPerTick(template, rates);
    rows.push({
        name: template.name,
        level: primaryOutputLevel,
        crew,
        outQty,
        inQty: template.needs.reduce((sum, need) => sum + need.quantity, 0),
        materials,
        wages,
        aux,
        total: materials + wages + aux,
        outValue,
        employment: 0,
    });
}

const byName = new Map(rows.map((row) => [row.name, row]));
let requiredWorkers = 0;
for (const agent of state.agents.values()) {
    for (const assets of Object.values(agent.assets)) {
        for (const facility of assets.productionFacilities as ProductionFacility[]) {
            const row = byName.get(facility.name);
            if (!row || facility.scale <= 0) {
                continue;
            }
            row.employment += facility.scale * row.crew;
            requiredWorkers += facility.scale * row.crew;
        }
    }
}

const weighted = (pick: (row: Row) => number): number =>
    requiredWorkers > 0 ? rows.reduce((sum, row) => sum + row.employment * pick(row), 0) / requiredWorkers : 0;

const ignition = MIN_WAGE / WAGE_SHARE;
console.log(`### recipe audit — ${arm} (ignition needs value added/worker > ${f(ignition)})`);
console.log(
    `    employment-weighted: valueAddedShare=${(100 * weighted((r) => (r.wages + r.aux) / r.total)).toFixed(1)}%` +
        `  materialsShare=${(100 * weighted((r) => r.materials / r.total)).toFixed(1)}%` +
        `  valueAdded/worker(at cost)=${f(weighted((r) => (r.wages + r.aux) / r.crew))}`,
);
console.log('');
console.log('level        crew  outQty inQty  materials    wages      aux  valueAdd%  out/in  vAdd/worker  employment  template');
const sorted = [...rows].sort((a, b) => b.employment - a.employment);
for (const row of sorted) {
    if (row.employment <= 0) {
        continue;
    }
    const share = (row.wages + row.aux) / row.total;
    const ratio = row.materials > 0 ? row.outValue / row.materials : Number.POSITIVE_INFINITY;
    console.log(
        `${row.level.padEnd(12)} ${String(row.crew).padStart(4)} ${String(row.outQty).padStart(7)} ${String(row.inQty).padStart(5)} ` +
            `${f(row.materials, 1).padStart(10)} ${f(row.wages, 1).padStart(8)} ${f(row.aux, 1).padStart(8)} ` +
            `${(100 * share).toFixed(1).padStart(9)}% ${(Number.isFinite(ratio) ? f(ratio, 2) : 'inf').padStart(7)} ` +
            `${f((row.wages + row.aux) / row.crew).padStart(11)} ${row.employment.toExponential(2).padStart(11)}  ${row.name}`,
    );
}
