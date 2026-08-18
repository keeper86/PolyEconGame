import fs from 'node:fs';
import path from 'node:path';

import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '../../src/simulation/constants';
import { advanceTick, seedRng } from '../../src/simulation/engine';
import { sampleMetrics, type MetricMap } from './metrics';
import { formatDuration, printSeries, toCsv, yearlySeries } from './report';
import { keepOnlyPlanet, loadHexSnapshot } from './snapshotTools';

const OUT_ROOT = path.join(__dirname, 'results');
const DEFAULT_INPUT = path.join(__dirname, 'snapshot_zipped.gz');

function arg(name: string): string | undefined {
    const prefix = `--${name}=`;
    const found = process.argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
}

function main(): void {
    const input = arg('input') ?? DEFAULT_INPUT;
    const years = Number(arg('years') ?? 5);
    const seed = Number(arg('seed') ?? 1001);
    const keep = arg('keep') ?? 'earth';
    const sampleEvery = TICKS_PER_MONTH;

    const gameState = loadHexSnapshot(input);
    if (keep !== 'none') {
        keepOnlyPlanet(gameState, keep);
    }
    seedRng(seed);

    const startTick = gameState.tick;
    const totalTicks = years * TICKS_PER_YEAR;
    const monthly: MetricMap[] = [];

    console.log(
        `snapshot tick=${startTick} year=${(startTick / TICKS_PER_YEAR).toFixed(3)}  ` +
            `planets=${gameState.planets.size} agents=${gameState.agents.size} keep=${keep}`,
    );
    console.log(`running ${years} years (${totalTicks} ticks) from tick ${startTick}…`);

    const t0 = process.hrtime.bigint();
    let prevPopulation = sampleMetrics(gameState).totalPopulation;

    for (let i = 1; i <= totalTicks; i++) {
        gameState.tick = startTick + i;
        advanceTick(gameState);
        if (i % sampleEvery === 0) {
            const sample = sampleMetrics(gameState);
            sample.birthsThisMonth = Math.max(0, sample.totalPopulation - prevPopulation + sample.deathsThisMonth);
            prevPopulation = sample.totalPopulation;
            monthly.push(sample);
        }
        if (i % TICKS_PER_YEAR === 0) {
            const year = i / TICKS_PER_YEAR;
            const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
            const msPerTick = elapsedMs / i;
            const etaMs = msPerTick * (totalTicks - i);
            const last = monthly[monthly.length - 1];
            console.log(
                `y${year}/${years} tick=${gameState.tick}  pop=${last?.totalPopulation?.toFixed(0) ?? 'n/a'}  ` +
                    `groceryBuffer=${last?.groceryBuffer?.toFixed(4) ?? 'n/a'}  ` +
                    `fill=${last?.groceryFillRate?.toFixed(4) ?? 'n/a'}  ` +
                    `${formatDuration(elapsedMs)} elapsed, ~${formatDuration(etaMs)} left`,
            );
        }
    }

    const t1 = process.hrtime.bigint();
    const wallMs = Number(t1 - t0) / 1e6;
    const msPerTick = wallMs / totalTicks;

    const outDir = path.join(OUT_ROOT, 'fromSnapshot');
    fs.mkdirSync(outDir, { recursive: true });
    const csvPath = path.join(outDir, 'series.csv');
    fs.writeFileSync(csvPath, toCsv(monthly));

    const yearly = yearlySeries(monthly);
    const summary = {
        startTick,
        years,
        seed,
        keep,
        msPerTick,
        ticksPerSecond: msPerTick > 0 ? 1000 / msPerTick : 0,
        yearly: Object.fromEntries([...yearly.entries()].map(([y, row]) => [y, row])),
    };
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

    console.log(`\n${msPerTick.toFixed(2)} ms/tick, ${(1000 / msPerTick).toFixed(1)} ticks/s`);
    console.log(`\nGrocery-relevant yearly means:`);
    printSeries(yearly, [
        'groceryBuffer',
        'groceryFillRate',
        'avgGroceryStarvation',
        'foodPrice',
        'totalPopulation',
        'avgFacilityCondition',
    ]);

    console.log(`\nWrote ${csvPath}`);
    console.log(`Wrote ${path.join(outDir, 'summary.json')}`);
}

main();
