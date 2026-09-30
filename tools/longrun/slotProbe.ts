import fs from 'node:fs';
import path from 'node:path';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { getAllFacilities, type Agent, type GameState, type Planet } from '../../src/simulation/planet/planet';

const outDir = process.argv[2];
if (!outDir) {
    throw new Error('usage: slotProbe.ts <results-dir>');
}

const meta = JSON.parse(fs.readFileSync(path.join(outDir, 'checkpoint.json'), 'utf8'));
const state = deserializeSnapshot(fs.readFileSync(path.join(outDir, 'checkpoint.bin'))) as GameState;
const planet: Planet = state.planets.values().next().value as Planet;

const requirementOf = (facility: { workerRequirement: Record<string, number | undefined> }): number =>
    Object.values(facility.workerRequirement).reduce<number>((sum, count) => sum + (count ?? 0), 0);

const totals = { production: 0, storage: 0, management: 0 };
const storageScales: Array<{ name: string; scales: string; slots: number }> = [];
let totalSlots = 0;

state.agents.forEach((agent: Agent) => {
    if (agent.id === planet.governmentId || agent.id === planet.recycler.id) {
        return;
    }
    const assets = agent.assets[planet.id];
    if (!assets) {
        return;
    }
    const shells = Object.entries(assets.storage.shells);
    let storageSlots = 0;
    for (const [form, shell] of shells) {
        const req = requirementOf(shell);
        storageSlots += req * shell.maxScale;
    }
    storageScales.push({
        name: agent.name,
        scales: shells.map(([form, shell]) => `${form}=${shell.maxScale}`).join(' '),
        slots: storageSlots,
    });
    for (const facility of getAllFacilities(assets, true)) {
        const req = requirementOf(facility);
        totals[facility.type as keyof typeof totals] += req * facility.maxScale;
    }
    totalSlots += Object.values(assets.totalSlotCapacity).reduce<number>((sum, count) => sum + count, 0);
});

console.log(`tick=${state.tick} (y=${(state.tick / 360).toFixed(1)}) agents=${state.agents.size}`);
console.log(`slot capacity total=${totalSlots}`);
console.log(
    `req*maxScale: production=${totals.production.toFixed(0)} storage=${totals.storage.toFixed(0)} ` +
        `management=${totals.management.toFixed(0)}`,
);
console.log('\nstorage shells (maxScale per form, storage req*maxScale):');
for (const row of storageScales.sort((a, b) => b.slots - a.slots)) {
    console.log(`  ${row.name.padEnd(28)} slots=${row.slots.toFixed(0).padStart(8)}  ${row.scales}`);
}
console.log(`checkpoint meta: ${JSON.stringify(meta)}`);
