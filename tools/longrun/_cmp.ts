import { seedRng, advanceTick } from '../../src/simulation/engine';
import { createInitialGameState } from '../../src/simulation/initialUniverse';
import { buildBenchmarkWorld } from './world';

function bench(label: string, state: any, ticks: number): void {
    const t0 = process.hrtime.bigint();
    for (let t = 1; t <= ticks; t++) {
        state.tick = t;
        advanceTick(state);
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`${label}: ${ticks} ticks in ${ms.toFixed(0)}ms = ${(ms / ticks).toFixed(2)} ms/tick`);
}

seedRng(1);
const prod = createInitialGameState();
console.log('production: planets', prod.planets.size, 'agents', prod.agents.size);
bench('production', prod, 30);

seedRng(2);
const benchWorld = buildBenchmarkWorld({}).gameState;
console.log('benchmark: planets', benchWorld.planets.size, 'agents', benchWorld.agents.size);
bench('benchmark', benchWorld, 30);
