import fs from 'node:fs';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { updateProductionCostFloors } from '../../src/simulation/planet/production';
import type { Planet, GameState } from '../../src/simulation/planet/planet';
import type { ProductionFacility } from '../../src/simulation/planet/facility';

const arm = process.argv[2];
if (!arm) {
    throw new Error('usage: facilityFlows.ts <arm> [typeFilter]');
}
const filter = process.argv[3];
const state: GameState = deserializeSnapshot(fs.readFileSync(`tools/longrun/results/${arm}/checkpoint.bin`));
const planet = state.planets.values().next().value as Planet;
updateProductionCostFloors(planet);

const seen = new Set<string>();
const f = (v: number): string => (!Number.isFinite(v) ? 'n/a' : Math.abs(v) >= 1e4 ? v.toExponential(2) : v.toFixed(3));

for (const agent of state.agents.values()) {
    const assets = agent.assets[planet.id];
    if (!assets) {
        continue;
    }
    for (const facility of assets.productionFacilities as ProductionFacility[]) {
        if (seen.has(facility.name) || facility.produces.length === 0) {
            continue;
        }
        if (filter && !facility.name.toLowerCase().includes(filter.toLowerCase())) {
            continue;
        }
        seen.add(facility.name);
        const out = facility.produces[0];
        const tick = facility.lastTickResults as unknown as Record<string, number>;
        console.log(`\n### ${facility.name}  scale=${f(facility.scale)}  out=${out.resource.name}`);
        console.log(
            `    needs: ${facility.needs.map((n) => `${n.resource.name}:${n.quantity}`).join(' ') || '(none)'}`,
        );
        console.log(`    produces per tick: ${f(out.quantity)}`);
        console.log(
            `    floor=${f(planet.lastProductionCostFloors[out.resource.name] ?? Number.NaN)} ` +
                `price=${f(planet.marketPrices[out.resource.name] ?? Number.NaN)}`,
        );
        const numeric = Object.entries(tick).filter(
            ([, v]) => typeof v === 'number' && Number.isFinite(v as number) && (v as number) !== 0,
        );
        console.log(
            '    flows: ' + numeric.map(([k, v]) => `${k}=${f(v as number)}`).join('  '),
        );
    }
}
