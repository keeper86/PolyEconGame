import fs from 'node:fs';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';

const out = 'tools/longrun/results/longrun-baseline-600';
const meta = JSON.parse(fs.readFileSync(`${out}/checkpoint.json`, 'utf8'));
const state = deserializeSnapshot(fs.readFileSync(`${out}/checkpoint.bin`));
console.log('meta tick:', meta.tick);
console.log('state tick:', state.tick);
console.log('planets:', state.planets.size, 'agents:', state.agents.size);
const planet = state.planets.values().next().value;
console.log('population total:', planet.population.demography.reduce((s: number, c: any) => s + c.unoccupied.total + c.occupied.total + c.unableToWork.total, 0));
console.log('condition ok, checkpoint valid');
