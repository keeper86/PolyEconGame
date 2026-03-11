/**
 * benchmarks/simulation/bench.workforce.ts
 *
 * Micro-benchmarks for the workforce subsystems:
 *   - updateAllocatedWorkers
 *   - preProductionLaborMarketTick   (hiring, firing, voluntary quits)
 *   - postProductionLaborMarketTick  (month-boundary rotation)
 *   - laborMarketYearTick            (year-boundary cleanup)
 *   - syncWorkforceWithPopulation
 */

import { makeEnvironment, makeWorld } from '../utils/testHelper';
import { updateAllocatedWorkers } from '../workforce/allocatedWorkers';
import { postProductionLaborMarketTick } from '../workforce/laborMarketMonthTick';
import { preProductionLaborMarketTick } from '../workforce/laborMarketTick';
import { laborMarketYearTick } from '../workforce/laborMarketYearTick';
import { syncWorkforceWithPopulation } from '../workforce/workforceSync';
import { BenchmarkSuite } from './bench.harness';

const ENV = makeEnvironment();

function makeSmallWorld(nCompanies = 1) {
    return makeWorld({
        populationByEdu: { none: 60_000, primary: 30_000, secondary: 8_000, tertiary: 2_000 },
        companyIds: Array.from({ length: nCompanies }, (_, i) => `co-${i}`),
    });
}

function makeMediumWorld(nCompanies = 4) {
    return makeWorld({
        populationByEdu: { none: 500_000, primary: 300_000, secondary: 150_000, tertiary: 50_000 },
        companyIds: Array.from({ length: nCompanies }, (_, i) => `co-${i}`),
    });
}

export function workforceSuite(): BenchmarkSuite {
    const suite = new BenchmarkSuite('Workforce subsystems');

    // -----------------------------------------------------------------------
    // updateAllocatedWorkers
    // -----------------------------------------------------------------------

    suite.add(
        'updateAllocatedWorkers – small (2 agents)',
        () => {
            const { gameState } = makeSmallWorld(1);
            return gameState;
        },
        (gs) => {
            updateAllocatedWorkers(gs.agents, Object.values(gs.planets)[0]);
        },
        { iterations: 500, warmup: 50 },
    );

    suite.add(
        'updateAllocatedWorkers – medium (5 agents)',
        () => {
            const { gameState } = makeMediumWorld(4);
            return gameState;
        },
        (gs) => {
            updateAllocatedWorkers(gs.agents, Object.values(gs.planets)[0]);
        },
        { iterations: 300, warmup: 30 },
    );

    // -----------------------------------------------------------------------
    // preProductionLaborMarketTick (monthly)
    // -----------------------------------------------------------------------

    suite.add(
        'preProductionLaborMarketTick – small (2 agents)',
        () => {
            const { gameState } = makeSmallWorld(1);
            return gameState;
        },
        (gs) => {
            preProductionLaborMarketTick(gs.agents, Object.values(gs.planets)[0]);
        },
        { iterations: 300, warmup: 30 },
    );

    suite.add(
        'preProductionLaborMarketTick – medium (5 agents)',
        () => {
            const { gameState } = makeMediumWorld(4);
            return gameState;
        },
        (gs) => {
            preProductionLaborMarketTick(gs.agents, Object.values(gs.planets)[0]);
        },
        { iterations: 200, warmup: 20 },
    );

    // -----------------------------------------------------------------------
    // postProductionLaborMarketTick (monthly)
    // -----------------------------------------------------------------------

    suite.add(
        'postProductionLaborMarketTick – small (2 agents)',
        () => {
            const { gameState } = makeSmallWorld(1);
            return gameState;
        },
        (gs) => {
            postProductionLaborMarketTick(gs.agents, Object.values(gs.planets)[0]);
        },
        { iterations: 300, warmup: 30 },
    );

    suite.add(
        'postProductionLaborMarketTick – medium (5 agents)',
        () => {
            const { gameState } = makeMediumWorld(4);
            return gameState;
        },
        (gs) => {
            postProductionLaborMarketTick(gs.agents, Object.values(gs.planets)[0]);
        },
        { iterations: 200, warmup: 20 },
    );

    // -----------------------------------------------------------------------
    // laborMarketYearTick (annual)
    // -----------------------------------------------------------------------

    suite.add(
        'laborMarketYearTick – small (2 agents)',
        () => {
            const { gameState } = makeSmallWorld(1);
            return gameState;
        },
        (gs) => {
            laborMarketYearTick(gs.agents);
        },
        { iterations: 500, warmup: 50 },
    );

    suite.add(
        'laborMarketYearTick – medium (5 agents)',
        () => {
            const { gameState } = makeMediumWorld(4);
            return gameState;
        },
        (gs) => {
            laborMarketYearTick(gs.agents);
        },
        { iterations: 300, warmup: 30 },
    );

    // -----------------------------------------------------------------------
    // syncWorkforceWithPopulation
    // -----------------------------------------------------------------------

    suite.add(
        'syncWorkforceWithPopulation – small (100K pop)',
        () => {
            const { gameState, planet } = makeSmallWorld(1);
            return { gs: gameState, planet };
        },
        ({ gs, planet }) => {
            syncWorkforceWithPopulation(gs.agents, planet.id, planet.population, ENV);
        },
        { iterations: 300, warmup: 30 },
    );

    suite.add(
        'syncWorkforceWithPopulation – medium (1M pop)',
        () => {
            const { gameState, planet } = makeMediumWorld(4);
            return { gs: gameState, planet };
        },
        ({ gs, planet }) => {
            syncWorkforceWithPopulation(gs.agents, planet.id, planet.population, ENV);
        },
        { iterations: 100, warmup: 10 },
    );

    return suite;
}
