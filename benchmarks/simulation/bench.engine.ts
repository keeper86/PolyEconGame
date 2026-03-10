/**
 * benchmarks/simulation/bench.engine.ts
 *
 * Full-engine benchmarks: single tick and multi-tick runs on both a small
 * world (Alpha-Centauri scale) and the large world (Earth scale).
 *
 * These are the most important numbers — they tell you the wall-clock cost of
 * one game tick at real-world population sizes and reveal whether the total
 * engine scales linearly with agent/population count.
 */

import { advanceTick } from '../../src/simulation/engine';
import { createInitialGameState } from '../../src/simulation/utils/initialWorld';
import { makeWorld } from '../../src/simulation/utils/testHelper';
import { seedRng } from '../../src/simulation/utils/stochasticRound';
import { BenchmarkSuite } from './harness';

seedRng(42);

// ---------------------------------------------------------------------------
// Small world: 1 planet, 100 K people, 2 agents
// ---------------------------------------------------------------------------

function makeSmallWorld() {
    const { gameState } = makeWorld({
        populationByEdu: { none: 60_000, primary: 30_000, secondary: 8_000, tertiary: 2_000 },
        companyIds: ['company-a'],
        tick: 0,
    });
    return gameState;
}

// ---------------------------------------------------------------------------
// Medium world: 1 planet, 1 M people, 4 agents
// ---------------------------------------------------------------------------

function makeMediumWorld() {
    const { gameState } = makeWorld({
        populationByEdu: { none: 500_000, primary: 300_000, secondary: 150_000, tertiary: 50_000 },
        companyIds: ['co-1', 'co-2', 'co-3'],
        tick: 0,
    });
    return gameState;
}

// ---------------------------------------------------------------------------
// Full world: real initial world (~8 B + 1 M across two planets, 28 agents)
// ---------------------------------------------------------------------------

// Build once (expensive) and clone per setup by re-serialising tick counter.
// We deliberately call createInitialGameState() inside the setup lambda so
// the benchmark machinery can create a fresh state for each run block without
// paying for the construction inside the timed section.
//
// NOTE: createInitialGameState is itself a benchmarkable item — see bench.setup.ts.

export function engineSuite(): BenchmarkSuite {
    const suite = new BenchmarkSuite('Engine – full advanceTick');

    // --- Small world: single tick ---
    suite.add(
        'small world (100K pop) – 1 tick',
        () => makeSmallWorld(),
        (gs) => {
            gs.tick++;
            advanceTick(gs);
        },
        { iterations: 300, warmup: 30 },
    );

    // --- Small world: month boundary tick (tick 30) ---
    suite.add(
        'small world (100K pop) – month boundary tick',
        () => {
            const gs = makeSmallWorld();
            gs.tick = 29; // next increment hits 30 = month boundary
            return gs;
        },
        (gs) => {
            gs.tick++;
            advanceTick(gs);
            gs.tick = 29; // reset for next iteration
        },
        { iterations: 200, warmup: 20 },
    );

    // --- Small world: year boundary tick (tick 360) ---
    suite.add(
        'small world (100K pop) – year boundary tick',
        () => {
            const gs = makeSmallWorld();
            gs.tick = 359;
            return gs;
        },
        (gs) => {
            gs.tick++;
            advanceTick(gs);
            gs.tick = 359;
        },
        { iterations: 100, warmup: 10 },
    );

    // --- Medium world: single tick ---
    suite.add(
        'medium world (1M pop) – 1 tick',
        () => makeMediumWorld(),
        (gs) => {
            gs.tick++;
            advanceTick(gs);
        },
        { iterations: 100, warmup: 10 },
    );

    // --- Medium world: year boundary ---
    suite.add(
        'medium world (1M pop) – year boundary tick',
        () => {
            const gs = makeMediumWorld();
            gs.tick = 359;
            return gs;
        },
        (gs) => {
            gs.tick++;
            advanceTick(gs);
            gs.tick = 359;
        },
        { iterations: 50, warmup: 5 },
    );

    // --- Full world: single tick (expensive — fewer iterations) ---
    suite.add(
        'full world (8B+1M pop, 28 agents) – 1 tick',
        () => createInitialGameState(),
        (gs) => {
            gs.tick++;
            advanceTick(gs);
        },
        { iterations: 20, warmup: 3 },
    );

    // --- Full world: year boundary tick ---
    suite.add(
        'full world (8B+1M pop, 28 agents) – year boundary tick',
        () => {
            const gs = createInitialGameState();
            gs.tick = 359;
            return gs;
        },
        (gs) => {
            gs.tick++;
            advanceTick(gs);
            gs.tick = 359;
        },
        { iterations: 10, warmup: 2 },
    );

    // --- Multi-tick burst: one simulated year of ticks on small world ---
    suite.add(
        'small world – 360 ticks (1 sim-year)',
        () => makeSmallWorld(),
        (gs) => {
            for (let i = 0; i < 360; i++) {
                gs.tick++;
                advanceTick(gs);
            }
            gs.tick = 0; // reset so next iteration starts fresh
        },
        { iterations: 10, warmup: 2 },
    );

    return suite;
}
