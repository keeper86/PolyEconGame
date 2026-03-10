/**
 * benchmarks/simulation/bench.population.ts
 *
 * Micro-benchmarks for each population subsystem:
 *   - consumeFood (nutrition)
 *   - applyMortality
 *   - applyDisability
 *   - applyRetirement
 *   - populationBirthsTick (fertility)
 *   - populationAdvanceYear (aging + cohort shift)
 *   - calculateDemographicStats
 *
 * Two population sizes are used: 100 K (small) and 8 M (earth-scale).
 * The setup creates a fresh population before the timed block so that
 * state mutations from one iteration don't skew the next.
 */

import { consumeFood } from '../../src/simulation/population/nutrition';
import { applyMortality } from '../../src/simulation/population/mortality';
import { applyDisability } from '../../src/simulation/population/disability';
import { applyRetirement } from '../../src/simulation/population/retirement';
import { populationBirthsTick } from '../../src/simulation/population/fertility';
import { populationAdvanceYear } from '../../src/simulation/population/aging';
import { calculateDemographicStats } from '../../src/simulation/population/demographics';
import { createPopulation } from '../../src/simulation/utils/entities';
import { makeEnvironment } from '../../src/simulation/utils/testHelper';
import { BenchmarkSuite } from './harness';

const ENV_CLEAN = makeEnvironment();
const ENV_POLLUTED = makeEnvironment({
    pollution: { air: 20, water: 15, soil: 10 },
});

export function populationSuite(): BenchmarkSuite {
    const suite = new BenchmarkSuite('Population subsystems');

    // -----------------------------------------------------------------------
    // calculateDemographicStats — runs every tick; should be very cheap
    // -----------------------------------------------------------------------

    suite.add(
        'demographicStats – 100K pop',
        () => createPopulation(100_000),
        (pop) => {
            calculateDemographicStats(pop);
        },
        { iterations: 500, warmup: 50 },
    );

    suite.add(
        'demographicStats – 8M pop',
        () => createPopulation(8_000_000),
        (pop) => {
            calculateDemographicStats(pop);
        },
        { iterations: 100, warmup: 10 },
    );

    // -----------------------------------------------------------------------
    // consumeFood — nutrition tick
    // -----------------------------------------------------------------------

    suite.add(
        'consumeFood – 100K pop',
        () => createPopulation(100_000),
        (pop) => {
            consumeFood(pop);
        },
        { iterations: 500, warmup: 50 },
    );

    suite.add(
        'consumeFood – 8M pop',
        () => createPopulation(8_000_000),
        (pop) => {
            consumeFood(pop);
        },
        { iterations: 100, warmup: 10 },
    );

    // -----------------------------------------------------------------------
    // applyMortality — death tick
    // -----------------------------------------------------------------------

    suite.add(
        'applyMortality – 100K pop, clean env',
        () => createPopulation(100_000),
        (pop) => {
            applyMortality(pop, ENV_CLEAN);
        },
        { iterations: 300, warmup: 30 },
    );

    suite.add(
        'applyMortality – 8M pop, clean env',
        () => createPopulation(8_000_000),
        (pop) => {
            applyMortality(pop, ENV_CLEAN);
        },
        { iterations: 50, warmup: 5 },
    );

    suite.add(
        'applyMortality – 8M pop, polluted env',
        () => createPopulation(8_000_000),
        (pop) => {
            applyMortality(pop, ENV_POLLUTED);
        },
        { iterations: 50, warmup: 5 },
    );

    // -----------------------------------------------------------------------
    // applyDisability
    // -----------------------------------------------------------------------

    suite.add(
        'applyDisability – 100K pop',
        () => createPopulation(100_000),
        (pop) => {
            applyDisability(pop, ENV_CLEAN);
        },
        { iterations: 300, warmup: 30 },
    );

    suite.add(
        'applyDisability – 8M pop',
        () => createPopulation(8_000_000),
        (pop) => {
            applyDisability(pop, ENV_CLEAN);
        },
        { iterations: 50, warmup: 5 },
    );

    // -----------------------------------------------------------------------
    // applyRetirement
    // -----------------------------------------------------------------------

    suite.add(
        'applyRetirement – 100K pop',
        () => createPopulation(100_000),
        (pop) => {
            applyRetirement(pop);
        },
        { iterations: 300, warmup: 30 },
    );

    suite.add(
        'applyRetirement – 8M pop',
        () => createPopulation(8_000_000),
        (pop) => {
            applyRetirement(pop);
        },
        { iterations: 50, warmup: 5 },
    );

    // -----------------------------------------------------------------------
    // populationBirthsTick (fertility)
    // -----------------------------------------------------------------------

    suite.add(
        'births – 100K pop',
        () => {
            const pop = createPopulation(100_000);
            const { fertileWomen } = calculateDemographicStats(pop);
            return { pop, fertileWomen };
        },
        ({ pop, fertileWomen }) => {
            populationBirthsTick(pop, fertileWomen, ENV_CLEAN.pollution);
        },
        { iterations: 300, warmup: 30 },
    );

    suite.add(
        'births – 8M pop',
        () => {
            const pop = createPopulation(8_000_000);
            const { fertileWomen } = calculateDemographicStats(pop);
            return { pop, fertileWomen };
        },
        ({ pop, fertileWomen }) => {
            populationBirthsTick(pop, fertileWomen, ENV_CLEAN.pollution);
        },
        { iterations: 50, warmup: 5 },
    );

    // -----------------------------------------------------------------------
    // populationAdvanceYear (aging) — year-boundary only
    // -----------------------------------------------------------------------

    suite.add(
        'aging (advanceYear) – 100K pop',
        () => {
            const pop = createPopulation(100_000);
            const { totalInCohort } = calculateDemographicStats(pop);
            return { pop, totalInCohort };
        },
        ({ pop, totalInCohort }) => {
            populationAdvanceYear(pop, totalInCohort);
        },
        { iterations: 200, warmup: 20 },
    );

    suite.add(
        'aging (advanceYear) – 8M pop',
        () => {
            const pop = createPopulation(8_000_000);
            const { totalInCohort } = calculateDemographicStats(pop);
            return { pop, totalInCohort };
        },
        ({ pop, totalInCohort }) => {
            populationAdvanceYear(pop, totalInCohort);
        },
        { iterations: 30, warmup: 5 },
    );

    return suite;
}
