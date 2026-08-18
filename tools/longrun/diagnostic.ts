import { TICKS_PER_YEAR } from '../../src/simulation/constants';
import { advanceTick, seedRng } from '../../src/simulation/engine';
import { setConditionEfficiencyDisabled, setStorageStarvationEffectDisabled } from '../../src/simulation/planet/facility';
import { setHrProductivityEffectDisabled } from '../../src/simulation/workforce/hrBuffer';
import { getScenario, SCENARIOS } from './scenarios';
import { buildBenchmarkWorld } from './world';
import {
    buildScaleComparison,
    computeGroupedGaps,
    formatScaleComparison,
    sampleActualScales,
    sampleInFlightConstruction,
} from './solverDiagnostic';

function arg(name: string): string | undefined {
    const prefix = `--${name}=`;
    const found = process.argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
}

function main(): void {
    delete process.env.SIM_DEBUG;
    delete process.env.SIM_DEBUG_AUTOSCALE;

    const scenarioName = arg('scenario') ?? 'baseline';
    const scenario = getScenario(scenarioName);
    if (!scenario) {
        console.error(`Unknown scenario '${scenarioName}'. Available: ${SCENARIOS.map((s) => s.name).join(', ')}`);
        process.exit(2);
    }

    const years = Number(arg('years') ?? 0);

    seedRng(scenario.seed);
    setConditionEfficiencyDisabled(scenario.world.disableConditionEfficiency === true);
    setHrProductivityEffectDisabled(scenario.world.disableHrProductivityEffect === true);
    setStorageStarvationEffectDisabled(scenario.world.disableStorageStarvationEffect === true);
    const { gameState } = buildBenchmarkWorld(scenario.world);

    const population = scenario.world.population ?? 10_000_000;

    const printComparison = (tick: number): void => {
        const actual = sampleActualScales(gameState);
        const comparison = buildScaleComparison(population, actual);
        comparison.inFlightConstruction = sampleInFlightConstruction(gameState);
        console.log(`\n════════ tick ${tick} ════════`);
        console.log(formatScaleComparison(comparison));
        const gaps = computeGroupedGaps(comparison);
        console.log(
            `SUMMARY popFacing act/solv=${gaps.populationFacing.actualToSolver.toFixed(2)} act/tgt=${gaps.populationFacing.actualToTargets.toFixed(2)} | endogenous act/tgt=${gaps.endogenous.actualToTargets.toFixed(2)}`,
        );
    };

    console.log(`=== scale diagnostic: ${scenario.name} ===`);
    printComparison(gameState.tick);

    if (years <= 0) {
        return;
    }

    for (let year = 1; year <= years; year++) {
        for (let tick = 1; tick <= TICKS_PER_YEAR; tick++) {
            gameState.tick += 1;
            advanceTick(gameState);
        }
        printComparison(gameState.tick);
    }
}

main();
