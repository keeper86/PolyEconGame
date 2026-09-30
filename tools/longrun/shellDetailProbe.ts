import fs from 'node:fs';
import path from 'node:path';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { usageOfShell } from '../../src/simulation/planet/facility';
import { getAllFacilities, type Agent, type GameState, type Planet } from '../../src/simulation/planet/planet';
import { storageFormKeys } from '../../src/simulation/planet/facility';
import { storageSizingForFacilities } from '../../src/simulation/planet/automaticProductionScale/shellCompartments';

const outDir = process.argv[2];
const nameFilter = process.argv[3] ?? '';
if (!outDir) {
    throw new Error('usage: shellDetailProbe.ts <results-dir> [name-filter]');
}

const state = deserializeSnapshot(fs.readFileSync(path.join(outDir, 'checkpoint.bin'))) as GameState;
const planet: Planet = state.planets.values().next().value as Planet;

console.log(`tick=${state.tick} (y=${(state.tick / 360).toFixed(1)})`);
state.agents.forEach((agent: Agent) => {
    if (agent.id === planet.governmentId || agent.id === planet.recycler.id) {
        return;
    }
    const assets = agent.assets[planet.id];
    if (!assets) {
        return;
    }
    if (nameFilter && !agent.name.toLowerCase().includes(nameFilter.toLowerCase())) {
        return;
    }
    const required = storageSizingForFacilities(assets.productionFacilities, assets.shipConstructionFacilities);
    const lines: string[] = [];
    for (const form of storageFormKeys()) {
        const shell = assets.storage.shells[form];
        if (shell.maxScale <= 1 && Object.keys(shell.currentInStorage).length === 0) {
            continue;
        }
        const used = usageOfShell(shell);
        const shareList = Object.entries(shell.compartments)
            .map(([name, share]) => `${name}:${share.toFixed(3)}`)
            .join(' ');
        lines.push(
            `  ${form.padEnd(7)} maxScale=${shell.maxScale.toFixed(0).padStart(8)} ` +
                `required=${required.shells[form].toFixed(0).padStart(6)} ` +
                `ratio=${(shell.maxScale / Math.max(1, required.shells[form])).toFixed(1).padStart(7)} ` +
                `usedMass=${(used.mass / 1e6).toFixed(1).padStart(9)}M usedVolume=${(used.volume / 1e6).toFixed(1)}M ` +
                `compartments[${shareList}]`,
        );
    }
    if (lines.length > 0) {
        console.log(`${agent.name}\n${lines.join('\n')}`);
    }
});
