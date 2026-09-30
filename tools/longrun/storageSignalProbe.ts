import fs from 'node:fs';
import path from 'node:path';
import { TICKS_PER_MONTH } from '../../src/simulation/constants';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { getStorageCapacityState, queryStorageFacility } from '../../src/simulation/planet/facility';
import { getAllFacilities, type Agent, type GameState, type Planet } from '../../src/simulation/planet/planet';
import { STORAGE_TARGET_MONTHS } from '../../src/simulation/planet/automaticProductionScale/constants';
import {
    computeFacilityStorageSignal,
    inventoryTrend,
    reachableTargetQuantity,
} from '../../src/simulation/planet/automaticProductionScale/signalComputation';
import { STORAGE_TREND_HORIZON_MONTHS } from '../../src/simulation/planet/automaticProductionScale/constants';

const outDir = process.argv[2];
const nameFilter = process.argv[3] ?? '';
if (!outDir) {
    throw new Error('usage: storageSignalProbe.ts <results-dir> [name-filter]');
}

const state = deserializeSnapshot(fs.readFileSync(path.join(outDir, 'checkpoint.bin'))) as GameState;
const planet: Planet = state.planets.values().next().value as Planet;

const month = (value: number): string => (value / 1e6).toFixed(2) + 'M';

console.log(`tick=${state.tick} (y=${(state.tick / 360).toFixed(1)})  filter='${nameFilter}'`);
state.agents.forEach((agent: Agent) => {
    if (agent.id === planet.governmentId || agent.id === planet.recycler.id) {
        return;
    }
    const assets = agent.assets[planet.id];
    if (!assets) {
        return;
    }
    for (const facility of getAllFacilities(assets, true)) {
        if (facility.type !== 'production') {
            continue;
        }
        if (nameFilter && !facility.name.toLowerCase().includes(nameFilter.toLowerCase())) {
            continue;
        }
        const signal = computeFacilityStorageSignal(facility, assets);
        console.log(
            `\n${agent.name} / ${facility.name}  maxScale=${facility.maxScale.toFixed(1)} ` +
                `scale=${facility.scale.toFixed(1)} ` +
                `signal=${signal.maxError.toFixed(2)}/${signal.minError.toFixed(2)}`,
        );
        for (const output of facility.produces) {
            const resource = output.resource;
            const inventory = queryStorageFacility(assets.storage, resource.name, false);
            const capacity = getStorageCapacityState(assets.storage, resource);
            const monthly = TICKS_PER_MONTH * facility.maxScale * output.quantity;
            const target = STORAGE_TARGET_MONTHS * monthly;
            const reachable = reachableTargetQuantity(assets.storage, resource, monthly);
            const trend = inventoryTrend(assets, resource.name);
            const predicted = inventory + STORAGE_TREND_HORIZON_MONTHS * TICKS_PER_MONTH * trend;
            console.log(
                `  ${resource.name.padEnd(14)} stock=${month(inventory)} ` +
                    `shellCap12mo=${month(target)} physicalCap=${month(capacity.capacity.mass)} ` +
                    `reachable=${month(reachable)} predicted=${month(predicted)} ` +
                    `trend/tick=${trend.toFixed(0)} stockMonths=${(inventory / Math.max(1e-9, monthly)).toFixed(2)} ` +
                    `shellMonths=${(capacity.capacity.mass / Math.max(1e-9, monthly)).toFixed(2)}`,
            );
        }
    }
});
