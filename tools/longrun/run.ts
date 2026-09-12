import fs from 'node:fs';
import path from 'node:path';

import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '../../src/simulation/constants';
import { advanceTick, seedRng } from '../../src/simulation/engine';
import { setPopulationWealthTaxEnabled, setSupportEmployed, setSupportFoodAffordabilityMultiplier, setSupportWealthCapDays, setWealthTaxAllowance } from '../../src/simulation/agents/governmentAgent';
import {
    setContractionIntegralThreshold,
    setExpansionIntegralThreshold,
    setPidOutMaxDown,
    setServiceFillRateTarget,
    setServiceFlowDecayTarget,
    setServiceSellThroughTarget,
    setStorageSpaceClampEnabled,
    setMinScaleFraction,
    setStorageTargetMonths,
} from '../../src/simulation/planet/automaticProductionScale/runtimeConfig';
import { setNonRenewableClaimCostMultiplier } from '../../src/simulation/planet/claims';
import { setBankruptcyDebtWriteOffFraction } from '../../src/simulation/financial/bankruptcy';
import { deserializeSnapshot, serializeGameState } from '../../src/simulation/snapshotCompression';
import { getRngState, setRngState } from '../../src/simulation/utils/stochasticRound';
import type { GameState } from '../../src/simulation/planet/planet';
import { METRIC_KEYS, sampleMetrics, type MetricMap } from './metrics';
import { formatDuration, printYearly, yearlySeries } from './report';
import { mineWorkerProbe } from './mineWorkerProbe';
import { groceryFlowProbe, startGroceryProbe } from './groceryFlowProbe';
import { startTickProbe, tickProbe, tickProbeEnabled } from './tickProbe';
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

const CHECKPOINT_META_FILE = 'checkpoint.json';
const CHECKPOINT_STATE_FILE = 'checkpoint.bin';

interface CheckpointMeta {
    scenario: string;
    seed: number;
    years: number;
    tick: number;
    rng: [number, number];
    prevPopulation: number;
    pid: number;
}

function resetNonRenewableResources(gameState: GameState, multiplier: number): void {
    for (const planet of gameState.planets.values()) {
        for (const entry of Object.values(planet.resources)) {
            if (entry.pool.regenerationRate > 0) {
                continue;
            }
            entry.pool.quantity = entry.pool.maximumCapacity * multiplier;
            entry.pool.maximumCapacity *= multiplier;
            for (const claim of entry.claims) {
                claim.quantity = claim.maximumCapacity * multiplier;
                claim.maximumCapacity *= multiplier;
            }
        }
    }
}

function hasCheckpoint(outDir: string): boolean {
    return (
        fs.existsSync(path.join(outDir, CHECKPOINT_META_FILE)) &&
        fs.existsSync(path.join(outDir, CHECKPOINT_STATE_FILE))
    );
}

function saveCheckpoint(
    outDir: string,
    gameState: GameState,
    meta: Omit<CheckpointMeta, 'rng' | 'pid'>,
): void {
    fs.mkdirSync(outDir, { recursive: true });
    const metaFile: CheckpointMeta = { ...meta, rng: getRngState(), pid: process.pid };
    fs.writeFileSync(path.join(outDir, CHECKPOINT_META_FILE), JSON.stringify(metaFile, null, 2));
    fs.writeFileSync(path.join(outDir, CHECKPOINT_STATE_FILE), serializeGameState(gameState));
    console.log(
        `[checkpoint] saved tick ${meta.tick} (y${(meta.tick / TICKS_PER_YEAR).toFixed(1)}), rng=[${metaFile.rng.join(',')}]`,
    );
}

function loadCheckpoint(outDir: string): { meta: CheckpointMeta; gameState: GameState } {
    const meta = JSON.parse(fs.readFileSync(path.join(outDir, CHECKPOINT_META_FILE), 'utf8')) as CheckpointMeta;
    const gameState = deserializeSnapshot(fs.readFileSync(path.join(outDir, CHECKPOINT_STATE_FILE)));
    return { meta, gameState };
}

function removeCheckpoint(outDir: string): void {
    fs.rmSync(path.join(outDir, CHECKPOINT_META_FILE), { force: true });
    fs.rmSync(path.join(outDir, CHECKPOINT_STATE_FILE), { force: true });
}

function writeCsvHeader(filePath: string, keys: readonly string[]): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, keys.join(',') + '\n');
}

function appendCsvRows(
    filePath: string,
    keys: readonly string[],
    rows: Array<Record<string, number | undefined>>,
): void {
    if (rows.length === 0) {
        return;
    }
    const lines = rows.map((row) => keys.map((key) => row[key] ?? '').join(','));
    fs.appendFileSync(filePath, lines.join('\n') + '\n');
}

function readCsv(filePath: string): Array<Record<string, number | undefined>> {
    if (!fs.existsSync(filePath)) {
        return [];
    }
    const text = fs.readFileSync(filePath, 'utf8').trim();
    if (!text) {
        return [];
    }
    const [headerLine, ...lines] = text.split('\n');
    const keys = headerLine.split(',');
    return lines.map((line) => {
        const values = line.split(',');
        const row: Record<string, number | undefined> = {};
        keys.forEach((key, index) => {
            const value = values[index];
            row[key] = value === undefined || value === '' ? undefined : Number(value);
        });
        return row;
    });
}

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

async function runScenario(
    scenario: Scenario,
    years: number,
    sampleEvery: number,
    seedOverride: number | undefined,
    outDir: string,
    checkpointEveryYears: number,
    resume: boolean,
    resumeResourceMultiplier?: number,
): Promise<{ monthly: MetricMap[]; msPerTick: number; scaleGaps: Array<Record<string, number>>; startTick: number }> {
    const totalTicks = years * TICKS_PER_YEAR;
    const monthly: MetricMap[] = [];
    const scaleGaps: Array<Record<string, number>> = [];
    const population = scenario.world.population ?? 10_000_000;

    let gameState: GameState;
    let startTick: number;
    let prevPopulation: number;
    let planetId = '';

    if (resume && hasCheckpoint(outDir)) {
        const { meta, gameState: loaded } = loadCheckpoint(outDir);
        if (meta.scenario !== scenario.name || meta.seed !== (seedOverride ?? scenario.seed) || meta.years !== years) {
            throw new Error(
                `checkpoint mismatch: found ${meta.scenario}/s${meta.seed}/${meta.years}y at tick ${meta.tick}, ` +
                    `run is ${scenario.name}/s${seedOverride ?? scenario.seed}/${years}y`,
            );
        }
        gameState = loaded;
        startTick = meta.tick;
        prevPopulation = meta.prevPopulation;
        setRngState(meta.rng);
        if (resumeResourceMultiplier !== undefined && resumeResourceMultiplier !== 1) {
            resetNonRenewableResources(gameState, resumeResourceMultiplier);
            console.log(
                `[${scenario.name}] reset non-renewable resources to ${resumeResourceMultiplier}x initial capacity`,
            );
        }
        monthly.push(...(readCsv(path.join(outDir, 'series.csv')) as MetricMap[]));
        scaleGaps.push(...(readCsv(path.join(outDir, 'scaleGaps.csv')) as Array<Record<string, number>>));
        if (!fs.existsSync(path.join(outDir, 'series.csv'))) {
            writeCsvHeader(path.join(outDir, 'series.csv'), METRIC_KEYS);
        }
        if (!fs.existsSync(path.join(outDir, 'scaleGaps.csv'))) {
            writeCsvHeader(path.join(outDir, 'scaleGaps.csv'), GAP_METRIC_KEYS);
        }
        console.log(
            `[${scenario.name}] resuming from checkpoint tick ${startTick} ` +
                `(y${(startTick / TICKS_PER_YEAR).toFixed(1)}), ${monthly.length} samples already recorded`,
        );
    } else {
        seedRng(seedOverride ?? scenario.seed);
        const built = buildBenchmarkWorld(scenario.world);
        gameState = built.gameState;
        planetId = built.planet.id;
        startTick = 0;
        prevPopulation = sampleMetrics(gameState).totalPopulation;
        fs.mkdirSync(outDir, { recursive: true });
        writeCsvHeader(path.join(outDir, 'series.csv'), METRIC_KEYS);
        writeCsvHeader(path.join(outDir, 'scaleGaps.csv'), GAP_METRIC_KEYS);
        const seedComparison = buildScaleComparison(population, sampleActualScales(gameState));
        seedComparison.inFlightConstruction = sampleInFlightConstruction(gameState);
        fs.writeFileSync(path.join(outDir, 'seedGap.txt'), formatScaleComparison(seedComparison) + '\n');
        console.log(`[${scenario.name}] world ready: ${built.agents.length} agents, 1 planet, ${totalTicks} ticks`);
    }

    const checkpointInterval = checkpointEveryYears * TICKS_PER_YEAR;
    const checkpointMeta = { scenario: scenario.name, seed: seedOverride ?? scenario.seed, years };

    console.log(`[${scenario.name}] starting…`);

    if (process.env.GROCERY_PROBE === '1') {
        startGroceryProbe(outDir);
        console.log(`[${scenario.name}] groceryFlowProbe active: drips per tick every tick into ${path.join(outDir, 'groceryFlow.csv')}`);
    }
    if (tickProbeEnabled()) {
        startTickProbe(outDir);
        console.log(`[${scenario.name}] tickProbe active: per-tick scale/signal capture into ${path.join(outDir, 'tickProbe.csv')}`);
    }

    let lastCompletedTick = startTick;
    let abortReason = '';
    const t0 = process.hrtime.bigint();

    const onSignal = (signal: string): void => {
        console.log(`\n[${scenario.name}] ${signal} received — saving checkpoint at tick ${lastCompletedTick}…`);
        saveCheckpoint(outDir, gameState, { ...checkpointMeta, tick: lastCompletedTick, prevPopulation });
        console.log(`[${scenario.name}] checkpoint saved, exiting. Resume later with --resume.`);
        process.exit(0);
    };
    const onInt = (): void => onSignal('SIGINT');
    const onTerm = (): void => onSignal('SIGTERM');
    process.on('SIGINT', onInt);
    process.on('SIGTERM', onTerm);

    for (let t = startTick + 1; t <= totalTicks; t++) {
        gameState.tick = t;
        advanceTick(gameState);
        lastCompletedTick = t;
        if (process.env.GROCERY_PROBE === '1') {
            groceryFlowProbe(gameState, outDir);
        }
        if (tickProbeEnabled()) {
            tickProbe(gameState, outDir);
        }
        if (t % 30 === 0) {
            await new Promise<void>((resolve) => setImmediate(resolve));
        }
        if (t % sampleEvery === 0) {
            const sample = sampleMetrics(gameState);
            sample.birthsThisMonth = Math.max(0, sample.totalPopulation - prevPopulation + sample.deathsThisMonth);
            prevPopulation = sample.totalPopulation;
            monthly.push(sample);
            appendCsvRows(path.join(outDir, 'series.csv'), METRIC_KEYS, [sample]);
            if (process.env.MINE_PROBE === '1') {
                mineWorkerProbe(gameState, outDir);
            }
            if (sample.totalPopulation < 1) {
                abortReason = `population extinct at y${(t / TICKS_PER_YEAR).toFixed(2)}`;
                console.log(`[${scenario.name}] ${abortReason}, aborting run`);
                break;
            }
        }
        if (t % TICKS_PER_YEAR === 0) {
            const year = t / TICKS_PER_YEAR;
            const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
            const msPerTick = elapsedMs / (t - startTick);
            const etaMs = msPerTick * (totalTicks - t);
            const lastSample = monthly[monthly.length - 1];
            console.log(
                `[${scenario.name}] y${year}/${years}  pop=${lastSample?.totalPopulation?.toFixed(0) ?? 'n/a'}  ` +
                    `condition=${lastSample?.avgFacilityCondition?.toFixed(3) ?? 'n/a'}  ` +
                    `${formatDuration(elapsedMs)} elapsed, ~${formatDuration(etaMs)} left`,
            );

            const actual = sampleActualScales(gameState);
            const inFlight = sampleInFlightConstruction(gameState);
            const gapRow = { year, ...computeGapMetrics(population, actual, inFlight) };
            scaleGaps.push(gapRow);
            appendCsvRows(path.join(outDir, 'scaleGaps.csv'), GAP_METRIC_KEYS, [gapRow]);
        }
        if (t % checkpointInterval === 0) {
            saveCheckpoint(outDir, gameState, { ...checkpointMeta, tick: t, prevPopulation });
        }
    }

    process.removeListener('SIGINT', onInt);
    process.removeListener('SIGTERM', onTerm);

    const t1 = process.hrtime.bigint();
    const wallMs = Number(t1 - t0) / 1e6;
    const ticksRun = abortReason === '' ? totalTicks - startTick : lastCompletedTick - startTick;
    const msPerTick = wallMs / Math.max(1, ticksRun);

    console.log(
        `[${scenario.name}] done: ${msPerTick.toFixed(2)} ms/tick, ${(1000 / msPerTick).toFixed(1)} ticks/s. ` +
            `Planet: ${planetId || 'n/a (resumed)'}`,
    );

    if (abortReason === '') {
        removeCheckpoint(outDir);
    }

    return { monthly, msPerTick, scaleGaps, startTick };
}

async function main(): Promise<void> {
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
    const slackArg = arg('slack');
    if (slackArg !== undefined) {
        scenario.world = { ...scenario.world, solverSeedSlack: Number(slackArg) };
    }
    const constructionScaleArg = arg('constructionScaleFactor');
    if (constructionScaleArg !== undefined) {
        scenario.world = { ...scenario.world, constructionScaleFactor: Number(constructionScaleArg) };
    }
    const buildChainScaleArg = arg('buildChainScaleFactor');
    if (buildChainScaleArg !== undefined) {
        scenario.world = { ...scenario.world, buildChainScaleFactor: Number(buildChainScaleArg) };
    }
    const bankruptcyArg = arg('bankruptcy');
    if (bankruptcyArg !== undefined) {
        console.warn("The --bankruptcy flag is obsolete: bankruptcy is always enabled now.");
    }
    const interestRateArg = arg('interestRate');
    if (interestRateArg !== undefined) {
        scenario.world = { ...scenario.world, loanRatePerYear: Number(interestRateArg) };
    }
    const costSpringArg = arg('costSpringStrength');
    if (costSpringArg !== undefined) {
        scenario.world = { ...scenario.world, costSpringStrength: Number(costSpringArg) };
    }
    if (process.argv.includes('--fixedPersonalities')) {
        throw new Error('--fixedPersonalities was removed: generateFixedPersonality is gone; personalities are now always random.');
    }
    const refineryMinAskArg = arg('refineryMinAskMultiplier');
    if (refineryMinAskArg !== undefined) {
        scenario.world = { ...scenario.world, refineryMinAskMultiplier: Number(refineryMinAskArg) };
    }
    const refineryPriceDownArg = arg('refineryPriceAdjustMaxDown');
    if (refineryPriceDownArg !== undefined) {
        scenario.world = { ...scenario.world, refineryPriceAdjustMaxDown: Number(refineryPriceDownArg) };
    }
    const refinerySellThroughArg = arg('refineryTargetSellThrough');
    if (refinerySellThroughArg !== undefined) {
        scenario.world = { ...scenario.world, refineryTargetSellThrough: Number(refinerySellThroughArg) };
    }
    const populationWealthTaxArg = arg('populationWealthTax');
    if (populationWealthTaxArg !== undefined) {
        scenario.world = { ...scenario.world, populationWealthTax: populationWealthTaxArg !== 'off' };
    }
    setPopulationWealthTaxEnabled(scenario.world.populationWealthTax ?? false);
    if (process.argv.includes('--noStorageClamp')) {
        setStorageSpaceClampEnabled(false);
        console.log('storage space clamp DISABLED (--noStorageClamp)');
    }
    const pidDownArg = arg('pidDown');
    if (pidDownArg !== undefined) {
        setPidOutMaxDown(Number(pidDownArg));
        console.log(`PID ramp-down limit overridden to ${pidDownArg}`);
    }
    const expansionThresholdArg = arg('expansionThreshold');
    if (expansionThresholdArg !== undefined) {
        setExpansionIntegralThreshold(Number(expansionThresholdArg));
        console.log(`expansion integral threshold overridden to ${expansionThresholdArg}`);
    }
    const contractionThresholdArg = arg('contractionThreshold');
    if (contractionThresholdArg !== undefined) {
        setContractionIntegralThreshold(Number(contractionThresholdArg));
        console.log(`contraction integral threshold overridden to ${contractionThresholdArg}`);
    }
    const storageTargetMonthsArg = arg('storageTargetMonths');
    if (storageTargetMonthsArg !== undefined) {
        setStorageTargetMonths(Number(storageTargetMonthsArg));
        console.log(`goods storage target buffer overridden to ${storageTargetMonthsArg} months`);
    }
    const minScaleFractionArg = arg('minScaleFraction');
    if (minScaleFractionArg !== undefined) {
        setMinScaleFraction(Number(minScaleFractionArg));
        console.log(`min scale fraction overridden to ${minScaleFractionArg}`);
    }
    const serviceSellThroughArg = arg('serviceSellThrough');
    if (serviceSellThroughArg !== undefined) {
        setServiceSellThroughTarget(Number(serviceSellThroughArg));
        console.log(`service seller sell-through target overridden to ${serviceSellThroughArg}`);
    }
    const serviceFillRateArg = arg('serviceFillRate');
    if (serviceFillRateArg !== undefined) {
        setServiceFillRateTarget(Number(serviceFillRateArg));
        console.log(`service buyer fill-rate target overridden to ${serviceFillRateArg}`);
    }
    const serviceDecayArg = arg('serviceDecayTarget');
    if (serviceDecayArg !== undefined) {
        setServiceFlowDecayTarget(Number(serviceDecayArg));
        console.log(`service flow decay target overridden to ${serviceDecayArg}`);
    }
    if (scenario.world.bankruptcyWriteOffFraction !== undefined) {
        setBankruptcyDebtWriteOffFraction(scenario.world.bankruptcyWriteOffFraction);
    }
    const bankruptcyWriteOffArg = arg('bankruptcyWriteOffFraction');
    if (bankruptcyWriteOffArg !== undefined) {
        setBankruptcyDebtWriteOffFraction(Number(bankruptcyWriteOffArg));
    }
    const claimCostArg = arg('claimCostMultiplier');
    if (claimCostArg !== undefined) {
        setNonRenewableClaimCostMultiplier(Number(claimCostArg));
    }
    const wealthTaxAllowanceArg = arg('wealthTaxAllowance');
    if (wealthTaxAllowanceArg !== undefined) {
        setWealthTaxAllowance(Number(wealthTaxAllowanceArg));
    }
    if (process.argv.includes('--supportEmployed')) {
        setSupportEmployed(true);
        console.log('government support extended to employed cohorts');
    }
    const supportWealthCapDaysArg = arg('supportWealthCapDays');
    if (supportWealthCapDaysArg !== undefined) {
        setSupportWealthCapDays(Number(supportWealthCapDaysArg));
        console.log(`government support wealth cap overridden to ${supportWealthCapDaysArg} days`);
    }
    const supportFoodAffordabilityArg = arg('supportFoodAffordability');
    if (supportFoodAffordabilityArg !== undefined) {
        setSupportFoodAffordabilityMultiplier(Number(supportFoodAffordabilityArg));
        console.log(`government support food affordability floor set to ${supportFoodAffordabilityArg} x food price/day`);
    }
    const resourceMultiplierArg = arg('resourceMultiplier');
    if (resourceMultiplierArg !== undefined) {
        scenario.world = { ...scenario.world, resourceMultiplier: Number(resourceMultiplierArg) };
    }
    const oilReservoirMultiplierArg = arg('oilReservoirMultiplier');
    if (oilReservoirMultiplierArg !== undefined) {
        scenario.world = { ...scenario.world, oilReservoirMultiplier: Number(oilReservoirMultiplierArg) };
        console.log(`oil reservoir multiplier overridden to ${oilReservoirMultiplierArg}`);
    }
    const populationArg = arg('population');
    if (populationArg !== undefined) {
        scenario.world = { ...scenario.world, population: Number(populationArg) };
        console.log(`initial population overridden to ${populationArg}`);
    }
    const bandsMode = arg('bands') ?? 'report';
    const sampleEvery = TICKS_PER_MONTH;
    const seedOverride = arg('seed') !== undefined ? Number(arg('seed')) : undefined;
    const checkpointEveryYears = Math.max(1, Number(arg('checkpointEveryYears') ?? 50));
    const resume = process.argv.includes('--resume');
    const resumeResourceMultiplier =
        arg('resumeResourceMultiplier') !== undefined ? Number(arg('resumeResourceMultiplier')) : undefined;
    const outDir = path.join(OUT_ROOT, arg('out') ?? scenario.name);

    const RESULT_FILES = ['series.csv', 'scaleGaps.csv', 'checkpoint.json', 'checkpoint.bin', 'summary.json', 'seedGap.txt'];
    const existingOut = fs.existsSync(outDir)
        ? fs.readdirSync(outDir).filter((f) => RESULT_FILES.includes(f))
        : [];
    if (!resume && existingOut.length > 0) {
        throw new Error(
            `out dir '${outDir}' already contains results (${existingOut.join(', ')}). ` +
                `A fresh run truncates series.csv/scaleGaps.csv and silently mixes rows with any previous ` +
                `or still-running process on the same dir. Use a fresh --out=<name>, or re-run the same run ` +
                `with --resume to continue from its checkpoint instead.`,
        );
    }
    if (resume && !hasCheckpoint(outDir)) {
        throw new Error(
            `--resume was passed but no checkpoint exists in '${outDir}' ` +
                `(need both checkpoint.json and checkpoint.bin). Start fresh without --resume into a clean ` +
                `--out=<name> instead.`,
        );
    }

    console.log(`=== scenario: ${scenario.name} ===`);
    console.log(scenario.description);
    console.log(`checkpointing every ${checkpointEveryYears}y → ${path.join(outDir, 'checkpoint.json')}${resume ? ' (--resume)' : ''}`);

    const { monthly, msPerTick, startTick } = await runScenario(
        scenario,
        years,
        sampleEvery,
        seedOverride,
        outDir,
        checkpointEveryYears,
        resume,
        resumeResourceMultiplier,
    );
    const yearly = yearlySeries(monthly);
    const bandResults = bandsMode === 'off' ? [] : evaluateBands(yearly, scenario.bands);

    const csvPath = path.join(outDir, 'series.csv');

    const summary = {
        scenario: scenario.name,
        description: scenario.description,
        seed: seedOverride ?? scenario.seed,
        years,
        resumedFromTick: startTick > 0 ? startTick : null,
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

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
