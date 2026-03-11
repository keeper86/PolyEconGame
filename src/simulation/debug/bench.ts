/**
 * benchmarks/simulation/bench.ts
 *
 * Main benchmark runner.  Import all suite factories and execute them in
 * sequence, then print a formatted report.
 *
 * Run:
 *   npm run bench
 *
 * Options (via environment variables):
 *   BENCH_SUITE=engine     – run only the named suite (partial match, case-insensitive)
 *   BENCH_JSON=1           – additionally emit a compact JSON summary to stdout
 *   BENCH_QUICK=1          – halve iteration counts for a fast smoke-check
 *
 * Examples:
 *   npm run bench
 *   BENCH_SUITE=population npm run bench
 *   BENCH_JSON=1 npm run bench > results.json
 *   BENCH_QUICK=1 npm run bench
 */

import { printAllReports, maybeEmitJson } from './bench.harness';
import type { SuiteReport } from './bench.harness';
import { setupSuite } from './bench.setup';
import { populationSuite } from './bench.population';
import { workforceSuite } from './bench.workforce';
import { marketSuite } from './bench.market';
import { financialSuite } from './bench.financial';
import { productionSuite } from './bench.production';
import { engineSuite } from './bench.engine';

// ---------------------------------------------------------------------------
// Collect all suite factories
// ---------------------------------------------------------------------------

const ALL_SUITES = [
    setupSuite,
    populationSuite,
    workforceSuite,
    productionSuite,
    financialSuite,
    marketSuite,
    engineSuite,
] as const;

// ---------------------------------------------------------------------------
// Filter by BENCH_SUITE env var
// ---------------------------------------------------------------------------

function selectedSuites(): (typeof ALL_SUITES)[number][] {
    const filter = process.env.BENCH_SUITE?.toLowerCase();
    if (!filter) {
        return [...ALL_SUITES];
    }
    return ALL_SUITES.filter((fn) => fn.name.toLowerCase().includes(filter));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const suiteFactories = selectedSuites();

    if (suiteFactories.length === 0) {
        console.error(`No suite matched BENCH_SUITE="${process.env.BENCH_SUITE}".`);
        console.error(`Available suites: ${ALL_SUITES.map((fn) => fn.name).join(', ')}`);
        process.exit(1);
    }

    console.log('\n🔬  Simulation Benchmark Harness');
    console.log(`    Running ${suiteFactories.length} suite(s)…\n`);

    const reports: SuiteReport[] = [];

    for (const factory of suiteFactories) {
        const suite = factory();
        process.stdout.write(`  ⏳ ${suite.name}…`);
        const report = await suite.run();
        reports.push(report);
        process.stdout.write(' done\n');
    }

    printAllReports(reports);
    maybeEmitJson(reports);
}

main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
});
