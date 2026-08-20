import fs from 'node:fs';
import path from 'node:path';

import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '../../src/simulation/constants';
import { setRedistributionTarget, setWealthTaxAnnualRate, setWealthTaxDisabled } from '../../src/simulation/agents/governmentAgent';
import { advanceTick, seedRng } from '../../src/simulation/engine';
import { setConditionEfficiencyDisabled, setStorageStarvationEffectDisabled } from '../../src/simulation/planet/facility';
import { setHrProductivityEffectDisabled } from '../../src/simulation/workforce/hrBuffer';
import { METRIC_KEYS, sampleMetrics, type MetricMap } from './metrics';
import { formatDuration, printYearly, toCsv, yearlySeries } from './report';
import { getScenario, SCENARIOS, type MetricBand, type Scenario } from './scenarios';
import {
    buildScaleComparison,
    computeGapMetrics,
    formatScaleComparison,
    sampleActualScales,
    sampleInFlightConstruction,
} from './solverDiagnostic';
import { buildBenchmarkWorld } from './world';

const OUT_ROOT = path.join(__dirname, 'results');

const GAP_METRIC_KEYS = [
    'year',
    'scalePopFacingSolver',
    'scalePopFacingTargets',
    'scalePopFacingSeeded',
    'scalePopFacingActual',
    'scalePopFacingActualToSolver',
    'scalePopFacingActualToTargets',
    'scalePopFacingActualToSeeded',
    'scalePopFacingTargetsToSolver',
    'scaleEndogenousSolver',
    'scaleEndogenousTargets',
    'scaleEndogenousSeeded',
    'scaleEndogenousActual',
    'scaleEndogenousActualToTargets',
    'scaleEndogenousActualToSeeded',
    'inFlightConstruction',
] as const;

function arg(name: string): string | undefined {
    const prefix = `--${name}=`;
    const found = process.argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
}

interface BandResult {
    metric: string;
    horizonYears: number;
    actual: number;
    min?: number;
    max?: number;
    relativeToStart: boolean;
    pass: boolean;
}

function evaluateBands(yearly: Map<number, MetricMap>, bands: MetricBand[]): BandResult[] {
    const refYear = yearly.get(1);
    return bands.map((band) => {
        const horizon = band.horizonYears;
        const startYear = Math.max(1, horizon - band.windowYears + 1);
        let sum = 0;
        let count = 0;
        for (let y = startYear; y <= horizon; y++) {
            const row = yearly.get(y);
            if (!row) {
                continue;
            }
            sum += row[band.metric] ?? 0;
            count += 1;
        }
        if (count === 0) {
            return {
                metric: band.metric,
                horizonYears: horizon,
                actual: Number.NaN,
                min: band.min,
                max: band.max,
                relativeToStart: band.relativeToStart ?? false,
                pass: false,
            };
        }
        let actual = sum / count;
        if (band.relativeToStart) {
            const ref = refYear?.[band.metric] ?? 0;
            actual = ref > 0 ? actual / ref : Number.NaN;
        }
        const pass =
            Number.isFinite(actual) &&
            (band.min === undefined || actual >= band.min) &&
            (band.max === undefined || actual <= band.max);
        return {
            metric: band.metric,
            horizonYears: horizon,
            actual,
            min: band.min,
            max: band.max,
            relativeToStart: band.relativeToStart ?? false,
            pass,
        };
    });
}

function runScenario(
    scenario: Scenario,
    years: number,
    sampleEvery: number,
): { monthly: MetricMap[]; msPerTick: number; seedGap: string; scaleGaps: Array<Record<string, number>> } {
    seedRng(scenario.seed);
    setConditionEfficiencyDisabled(scenario.world.disableConditionEfficiency === true);
    setHrProductivityEffectDisabled(scenario.world.disableHrProductivityEffect === true);
    setStorageStarvationEffectDisabled(scenario.world.disableStorageStarvationEffect === true);
    setWealthTaxDisabled(scenario.world.disableWealthTax === true);
    const { gameState, planet, agents } = buildBenchmarkWorld(scenario.world);
    const population = scenario.world.population ?? 10_000_000;

    const totalTicks = years * TICKS_PER_YEAR;
    const monthly: MetricMap[] = [];
    const scaleGaps: Array<Record<string, number>> = [];

    const seedComparison = buildScaleComparison(population, sampleActualScales(gameState));
    seedComparison.inFlightConstruction = sampleInFlightConstruction(gameState);
    const seedGap = formatScaleComparison(seedComparison);

    console.log(`[${scenario.name}] world ready: ${agents.length} agents, 1 planet, ${totalTicks} ticks`);
    console.log(`[${scenario.name}] starting…`);

    const t0 = process.hrtime.bigint();

    let prevPopulation = sampleMetrics(gameState).totalPopulation;
    for (let t = 1; t <= totalTicks; t++) {
        gameState.tick = t;
        advanceTick(gameState);
        if (t % sampleEvery === 0) {
            const sample = sampleMetrics(gameState);
            sample.birthsThisMonth = Math.max(0, sample.totalPopulation - prevPopulation + sample.deathsThisMonth);
            prevPopulation = sample.totalPopulation;
            monthly.push(sample);
            if (sample.totalPopulation < 1) {
                console.log(
                    `[${scenario.name}] population extinct at y${(t / TICKS_PER_YEAR).toFixed(2)}, aborting run`,
                );
                break;
            }
        }
        if (t % TICKS_PER_YEAR === 0) {
            const year = t / TICKS_PER_YEAR;
            const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
            const msPerTick = elapsedMs / t;
            const etaMs = msPerTick * (totalTicks - t);
            const lastSample = monthly[monthly.length - 1];
            console.log(
                `[${scenario.name}] y${year}/${years}  pop=${lastSample?.totalPopulation?.toFixed(0) ?? 'n/a'}  ` +
                    `condition=${lastSample?.avgFacilityCondition?.toFixed(3) ?? 'n/a'}  ` +
                    `${formatDuration(elapsedMs)} elapsed, ~${formatDuration(etaMs)} left`,
            );

            const actual = sampleActualScales(gameState);
            const inFlight = sampleInFlightConstruction(gameState);
            scaleGaps.push({ year, ...computeGapMetrics(population, actual, inFlight) });
        }
    }

    const t1 = process.hrtime.bigint();
    const wallMs = Number(t1 - t0) / 1e6;
    const msPerTick = wallMs / totalTicks;

    console.log(
        `[${scenario.name}] done: ${msPerTick.toFixed(2)} ms/tick, ${(1000 / msPerTick).toFixed(1)} ticks/s. Planet: ${planet.id}`,
    );

    return { monthly, msPerTick, seedGap, scaleGaps };
}

function main(): void {
    const debug = process.argv.includes('--debug');
    if (debug) {
        process.env.SIM_DEBUG = '1';
    } else {
        delete process.env.SIM_DEBUG;
        delete process.env.SIM_DEBUG_AUTOSCALE;
    }
    console.log(
        `SIM_DEBUG=${process.env.SIM_DEBUG ?? 'unset'} (${debug ? 'enabled via --debug' : 'disabled for benchmark'})`,
    );

    const scenarioName = arg('scenario') ?? 'baseline';
    const scenario = getScenario(scenarioName);
    if (!scenario) {
        console.error(`Unknown scenario '${scenarioName}'. Available: ${SCENARIOS.map((s) => s.name).join(', ')}`);
        process.exit(2);
    }

    const years = Number(arg('years') ?? scenario.years);
    const agentsPerProductArg = arg('agentsPerProduct');
    if (agentsPerProductArg !== undefined) {
        scenario.world = { ...scenario.world, agentsPerProduct: Number(agentsPerProductArg) };
    }
    if (process.argv.includes('--no-wealth-tax')) {
        scenario.world = { ...scenario.world, disableWealthTax: true };
    }
    const wealthTaxRateArg = arg('wealthTaxRate');
    if (wealthTaxRateArg !== undefined) {
        setWealthTaxAnnualRate(Number(wealthTaxRateArg));
    }
    const redistributionArg = arg('redistribute');
    if (redistributionArg === 'employed' || redistributionArg === 'nonEmployed' || redistributionArg === 'all') {
        setRedistributionTarget(redistributionArg);
    }
    const bandsMode = arg('bands') ?? 'report';
    const sampleEvery = TICKS_PER_MONTH;

    console.log(`=== scenario: ${scenario.name} ===`);
    console.log(scenario.description);

    const { monthly, msPerTick, seedGap, scaleGaps } = runScenario(scenario, years, sampleEvery);
    const yearly = yearlySeries(monthly);
    const bandResults = bandsMode === 'off' ? [] : evaluateBands(yearly, scenario.bands);

    const outDir = path.join(OUT_ROOT, scenario.name);
    fs.mkdirSync(outDir, { recursive: true });

    const csvPath = path.join(outDir, 'series.csv');
    fs.writeFileSync(csvPath, toCsv(monthly));

    fs.writeFileSync(path.join(outDir, 'seedGap.txt'), seedGap + '\n');

    const gapHeader = GAP_METRIC_KEYS.join(',');
    const gapLines = scaleGaps.map((row) => GAP_METRIC_KEYS.map((key) => row[key] ?? '').join(','));
    fs.writeFileSync(path.join(outDir, 'scaleGaps.csv'), [gapHeader, ...gapLines].join('\n') + '\n');

    const summary = {
        scenario: scenario.name,
        description: scenario.description,
        seed: scenario.seed,
        years,
        msPerTick,
        ticksPerSecond: msPerTick > 0 ? 1000 / msPerTick : 0,
        bands: bandResults.map((b) => ({ ...b, actual: Number.isFinite(b.actual) ? b.actual : null })),
        yearly: Object.fromEntries([...yearly.entries()].map(([y, row]) => [y, row])),
    };
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

    console.log(`\nYearly overview:`);
    printYearly(yearly, METRIC_KEYS);

    if (bandsMode === 'off') {
        console.log(`\nWrote ${csvPath}`);
        console.log(`Wrote ${path.join(outDir, 'summary.json')}`);
        console.log(`\n[${scenario.name}] completed (bands off)`);
        return;
    }

    console.log(`\nBands (mode=${bandsMode}):`);
    let allPass = true;
    for (const b of bandResults) {
        const rel = b.relativeToStart ? ' (relative to year 1)' : '';
        const actual = Number.isFinite(b.actual) ? b.actual.toFixed(3) : 'n/a';
        const range = `[${b.min ?? '-∞'}, ${b.max ?? '∞'}]`;
        console.log(
            `  ${b.pass ? 'PASS' : 'FAIL'}  ${b.metric} @y${b.horizonYears}${rel} = ${actual} expected ${range}`,
        );
        if (!b.pass) {
            allPass = false;
        }
    }

    console.log(`\nWrote ${csvPath}`);
    console.log(`Wrote ${path.join(outDir, 'summary.json')}`);

    if (bandsMode === 'strict' && !allPass) {
        console.error(`\n[${scenario.name}] band check FAILED (strict mode)`);
        process.exitCode = 1;
    } else {
        console.log(`\n[${scenario.name}] completed${allPass ? ', all bands pass' : ', some bands fail'}`);
    }
}

main();
