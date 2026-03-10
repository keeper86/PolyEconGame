/**
 * benchmarks/simulation/bench.setup.ts
 *
 * Benchmarks the world-construction cost: how long it takes to call
 * createInitialGameState() and makeWorld() at various sizes.
 *
 * These numbers matter because:
 *  1. They set a lower bound on server restart time.
 *  2. They tell us whether it's feasible to snapshot/restore state quickly.
 *  3. They show how demography initialisation (createPopulation) scales.
 */

import { createInitialGameState } from '../../src/simulation/utils/initialWorld';
import { makeWorld } from '../../src/simulation/utils/testHelper';
import { createPopulation } from '../../src/simulation/utils/entities';
import { BenchmarkSuite } from './harness';

export function setupSuite(): BenchmarkSuite {
    const suite = new BenchmarkSuite('World setup & initialisation');

    // -----------------------------------------------------------------------
    // createPopulation — the innermost demography builder
    // -----------------------------------------------------------------------

    suite.add(
        'createPopulation – 100K people',
        () => undefined,
        () => {
            createPopulation(100_000);
        },
        { iterations: 100, warmup: 10 },
    );

    suite.add(
        'createPopulation – 1M people',
        () => undefined,
        () => {
            createPopulation(1_000_000);
        },
        { iterations: 50, warmup: 5 },
    );

    suite.add(
        'createPopulation – 8B people',
        () => undefined,
        () => {
            createPopulation(8_000_000_000);
        },
        { iterations: 20, warmup: 3 },
    );

    // -----------------------------------------------------------------------
    // makeWorld — test-helper factory at different population sizes
    // -----------------------------------------------------------------------

    suite.add(
        'makeWorld – 100K pop, 2 agents',
        () => undefined,
        () => {
            makeWorld({
                populationByEdu: { none: 60_000, primary: 30_000, secondary: 8_000, tertiary: 2_000 },
                companyIds: ['co-1'],
            });
        },
        { iterations: 100, warmup: 10 },
    );

    suite.add(
        'makeWorld – 1M pop, 5 agents',
        () => undefined,
        () => {
            makeWorld({
                populationByEdu: { none: 500_000, primary: 300_000, secondary: 150_000, tertiary: 50_000 },
                companyIds: ['co-1', 'co-2', 'co-3', 'co-4'],
            });
        },
        { iterations: 30, warmup: 5 },
    );

    // -----------------------------------------------------------------------
    // createInitialGameState — the full production world builder
    // -----------------------------------------------------------------------

    suite.add(
        'createInitialGameState – full world (8B+1M, 28 agents)',
        () => undefined,
        () => {
            createInitialGameState();
        },
        { iterations: 10, warmup: 2 },
    );

    return suite;
}
