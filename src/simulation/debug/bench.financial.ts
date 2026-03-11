/**
 * benchmarks/simulation/bench.financial.ts
 *
 * Micro-benchmarks for the financial subsystems:
 *   - preProductionFinancialTick  (wage computation, working-capital loans, wage payments)
 *   - postProductionFinancialTick (revenue distribution, loan repayment)
 *
 * The two ticks together implement the double-entry money-flow model.
 * We benchmark them both in isolation and back-to-back (as in the real engine).
 */

import { preProductionFinancialTick, postProductionFinancialTick } from '../financial/financialTick';
import { makeWorld } from '../utils/testHelper';
import { BenchmarkSuite } from './bench.harness';

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

function makeLargeWorld(nCompanies = 20) {
    return makeWorld({
        populationByEdu: {
            none: 4_800_000,
            primary: 2_400_000,
            secondary: 600_000,
            tertiary: 200_000,
        },
        companyIds: Array.from({ length: nCompanies }, (_, i) => `co-${i}`),
    });
}

export function financialSuite(): BenchmarkSuite {
    const suite = new BenchmarkSuite('Financial subsystems');

    // -----------------------------------------------------------------------
    // preProductionFinancialTick
    // -----------------------------------------------------------------------

    suite.add(
        'preProductionFinancialTick – small (2 agents, 100K pop)',
        () => makeSmallWorld(1).gameState,
        (gs) => {
            preProductionFinancialTick(gs.agents, gs.planets.values().next().value!);
        },
        { iterations: 500, warmup: 50 },
    );

    suite.add(
        'preProductionFinancialTick – medium (5 agents, 1M pop)',
        () => makeMediumWorld(4).gameState,
        (gs) => {
            preProductionFinancialTick(gs.agents, gs.planets.values().next().value!);
        },
        { iterations: 200, warmup: 20 },
    );

    suite.add(
        'preProductionFinancialTick – large (21 agents, 8M pop)',
        () => makeLargeWorld(20).gameState,
        (gs) => {
            preProductionFinancialTick(gs.agents, gs.planets.values().next().value!);
        },
        { iterations: 50, warmup: 5 },
    );

    // -----------------------------------------------------------------------
    // postProductionFinancialTick
    // -----------------------------------------------------------------------

    suite.add(
        'postProductionFinancialTick – small (2 agents, 100K pop)',
        () => makeSmallWorld(1).gameState,
        (gs) => {
            postProductionFinancialTick(gs.agents, gs.planets.values().next().value!);
        },
        { iterations: 500, warmup: 50 },
    );

    suite.add(
        'postProductionFinancialTick – medium (5 agents, 1M pop)',
        () => makeMediumWorld(4).gameState,
        (gs) => {
            postProductionFinancialTick(gs.agents, gs.planets.values().next().value!);
        },
        { iterations: 200, warmup: 20 },
    );

    suite.add(
        'postProductionFinancialTick – large (21 agents, 8M pop)',
        () => makeLargeWorld(20).gameState,
        (gs) => {
            postProductionFinancialTick(gs.agents, gs.planets.values().next().value!);
        },
        { iterations: 50, warmup: 5 },
    );

    // -----------------------------------------------------------------------
    // Both ticks back-to-back (realistic sequence)
    // -----------------------------------------------------------------------

    suite.add(
        'pre+post financial – small (2 agents, 100K pop)',
        () => makeSmallWorld(1).gameState,
        (gs) => {
            preProductionFinancialTick(gs.agents, gs.planets.values().next().value!);
            postProductionFinancialTick(gs.agents, gs.planets.values().next().value!);
        },
        { iterations: 300, warmup: 30 },
    );

    suite.add(
        'pre+post financial – large (21 agents, 8M pop)',
        () => makeLargeWorld(20).gameState,
        (gs) => {
            preProductionFinancialTick(gs.agents, gs.planets.values().next().value!);
            postProductionFinancialTick(gs.agents, gs.planets.values().next().value!);
        },
        { iterations: 30, warmup: 5 },
    );

    return suite;
}
