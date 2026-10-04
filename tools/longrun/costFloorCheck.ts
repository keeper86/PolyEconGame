import fs from 'node:fs';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { updateProductionCostFloors } from '../../src/simulation/planet/production';
import {
    auxiliaryCostPerTick,
    auxiliaryCostRates,
    facilityInputCostPerTick,
    facilityWageCostPerTick,
} from '../../src/simulation/planet/auxiliaryCosts';
import type { Planet, GameState } from '../../src/simulation/planet/planet';

const arm = process.argv[2];
if (!arm) {
    throw new Error('usage: costFloorCheck.ts <arm>');
}
const state: GameState = deserializeSnapshot(fs.readFileSync(`tools/longrun/results/${arm}/checkpoint.bin`));
const planet = state.planets.values().next().value as Planet;
updateProductionCostFloors(planet);
const rates = auxiliaryCostRates(planet);

type Row = {
    type: string;
    output: string;
    floor: number;
    price: number;
    unitCost: number;
    inputs: number;
    wages: number;
    aux: number;
};

const byType = new Map<string, Row>();
for (const agent of state.agents.values()) {
    const assets = agent.assets[planet.id];
    if (!assets) {
        continue;
    }
    for (const facility of assets.productionFacilities) {
        if (facility.produces.length === 0) {
            continue;
        }
        const out = facility.produces[0];
        const qty = out.quantity > 0 ? out.quantity : 1;
        const inputs = facilityInputCostPerTick(facility, planet) / qty;
        const wages = facilityWageCostPerTick(facility, planet) / qty;
        const aux = auxiliaryCostPerTick(facility, rates) / qty;
        const prev = byType.get(facility.name);
        if (prev) {
            continue;
        }
        byType.set(facility.name, {
            type: facility.name,
            output: out.resource.name,
            floor: planet.lastProductionCostFloors[out.resource.name] ?? Number.NaN,
            price: planet.marketPrices[out.resource.name] ?? Number.NaN,
            unitCost: inputs + wages + aux,
            inputs,
            wages,
            aux,
        });
    }
}

const f = (v: number, d = 3): string => (!Number.isFinite(v) ? 'n/a' : v.toFixed(d));
console.log(`${arm} — theoretical unit cost vs market price (per facility type, % of unit cost)`);
console.log(
    'type                       output            floor     price  price/floor   unitCost  in%  wage%  aux%',
);
for (const r of [...byType.values()].sort((a, b) => a.floor / a.price - b.floor / b.price)) {
    console.log(
        `${r.type.padEnd(26)}${r.output.padEnd(18)}${f(r.floor).padStart(8)}${f(r.price).padStart(9)}` +
            `${f(r.price / r.floor).padStart(12)}${f(r.unitCost).padStart(11)}` +
            `${f((100 * r.inputs) / r.unitCost, 0).padStart(5)}${f((100 * r.wages) / r.unitCost, 0).padStart(6)}` +
            `${f((100 * r.aux) / r.unitCost, 0).padStart(6)}`,
    );
}
