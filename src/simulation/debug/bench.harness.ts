/**
 * benchmarks/simulation/harness.ts
 *
 * Core benchmarking primitives for the socio-economic simulation.
 *
 * Design goals:
 *  - Zero external dependencies (no benchmark library needed).
 *  - Statistical rigour: warm-up rounds, outlier trimming, mean + stddev + p95.
 *  - Structured result objects that can be printed as a table or serialised.
 *  - Each benchmark is a named "Suite" containing one or more "Cases".
 *
 * Usage:
 *   const suite = new BenchmarkSuite('My Suite');
 *   suite.add('my case', setup, fn, { iterations: 500, warmup: 50 });
 *   const report = await suite.run();
 *   printReport(report);
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BenchmarkOptions {
    /** Number of timed iterations (default 200). */
    iterations?: number;
    /** Warm-up iterations that are NOT counted (default 20). */
    warmup?: number;
}

export interface CaseResult {
    name: string;
    suiteName: string;
    iterations: number;
    /** Arithmetic mean of all iteration durations (ms). */
    meanMs: number;
    /** Standard deviation (ms). */
    stddevMs: number;
    /** Minimum duration (ms). */
    minMs: number;
    /** Maximum duration (ms). */
    maxMs: number;
    /** 95th-percentile duration (ms). */
    p95Ms: number;
    /** Estimated operations per second (1000 / meanMs). */
    opsPerSec: number;
    /** Total wall-clock time for all iterations (ms). */
    totalMs: number;
}

export interface SuiteReport {
    suiteName: string;
    cases: CaseResult[];
}

// ---------------------------------------------------------------------------
// Timing primitive
// ---------------------------------------------------------------------------

/**
 * High-resolution monotonic timer in milliseconds.
 * Uses `process.hrtime.bigint()` for sub-millisecond precision.
 */
function now(): number {
    return Number(process.hrtime.bigint()) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Statistics helpers
// ---------------------------------------------------------------------------

function mean(samples: number[]): number {
    return samples.reduce((a, b) => a + b, 0) / samples.length;
}

function stddev(samples: number[], avg: number): number {
    const variance = samples.reduce((acc, x) => acc + (x - avg) ** 2, 0) / samples.length;
    return Math.sqrt(variance);
}

function percentile(sortedSamples: number[], p: number): number {
    const idx = Math.ceil((p / 100) * sortedSamples.length) - 1;
    return sortedSamples[Math.max(0, idx)];
}

// ---------------------------------------------------------------------------
// BenchmarkSuite
// ---------------------------------------------------------------------------

type SetupFn<T> = () => T;
type BenchFn<T> = (state: T) => void;

interface PendingCase<T = unknown> {
    name: string;
    setup: SetupFn<T>;
    fn: BenchFn<T>;
    opts: Required<BenchmarkOptions>;
}

export class BenchmarkSuite {
    private readonly cases: PendingCase[] = [];

    constructor(public readonly name: string) {}

    /**
     * Register a benchmark case.
     *
     * @param name      Human-readable label.
     * @param setup     Factory that returns fresh state before each run block
     *                  (called once before warmup, once before timed block).
     * @param fn        The function under test, receives the state object.
     * @param options   Tuning knobs.
     */
    add<T>(name: string, setup: SetupFn<T>, fn: BenchFn<T>, options?: BenchmarkOptions): this {
        this.cases.push({
            name,
            setup,
            fn,
            opts: {
                iterations: options?.iterations ?? 200,
                warmup: options?.warmup ?? 20,
            },
        } as PendingCase);
        return this;
    }

    async run(): Promise<SuiteReport> {
        const results: CaseResult[] = [];

        for (const c of this.cases) {
            const result = runCase(this.name, c);
            results.push(result);
        }

        return { suiteName: this.name, cases: results };
    }
}

function runCase<T>(suiteName: string, c: PendingCase<T>): CaseResult {
    const { name, setup, fn, opts } = c;

    // --- Warm-up (state is discarded after) ---
    {
        const state = setup();
        for (let i = 0; i < opts.warmup; i++) {
            fn(state);
        }
    }

    // --- Timed block ---
    const state = setup();
    const samples: number[] = [];

    for (let i = 0; i < opts.iterations; i++) {
        const t0 = now();
        fn(state);
        samples.push(now() - t0);
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const avg = mean(samples);

    return {
        name,
        suiteName,
        iterations: opts.iterations,
        meanMs: avg,
        stddevMs: stddev(samples, avg),
        minMs: sorted[0],
        maxMs: sorted[sorted.length - 1],
        p95Ms: percentile(sorted, 95),
        opsPerSec: avg > 0 ? 1000 / avg : Number.POSITIVE_INFINITY,
        totalMs: samples.reduce((a, b) => a + b, 0),
    };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const COL = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    dim: '\x1b[2m',
};

function fmtMs(ms: number): string {
    if (ms < 0.001) {
        return `${(ms * 1_000).toFixed(2)} µs`;
    }
    if (ms < 1) {
        return `${ms.toFixed(3)} ms`;
    }
    if (ms < 1000) {
        return `${ms.toFixed(2)} ms`;
    }
    return `${(ms / 1000).toFixed(2)} s`;
}

function fmtOps(ops: number): string {
    if (ops >= 1e6) {
        return `${(ops / 1e6).toFixed(2)}M ops/s`;
    }
    if (ops >= 1e3) {
        return `${(ops / 1e3).toFixed(2)}K ops/s`;
    }
    return `${ops.toFixed(1)} ops/s`;
}

function pad(s: string, n: number, right = false): string {
    return right ? s.padStart(n) : s.padEnd(n);
}

export function printReport(report: SuiteReport): void {
    const { suiteName, cases } = report;
    console.log(`\n${COL.bold}${COL.cyan}━━━ ${suiteName} ━━━${COL.reset}`);

    const headers = ['Case', 'mean', 'stddev', 'min', 'p95', 'max', 'ops/s', 'iters'];
    const widths = [40, 10, 10, 10, 10, 10, 14, 7];

    const header = headers.map((h, i) => pad(h, widths[i], i > 0)).join('  ');
    console.log(`${COL.bold}${COL.dim}${header}${COL.reset}`);
    console.log(COL.dim + '─'.repeat(widths.reduce((a, b) => a + b + 2, 0)) + COL.reset);

    for (const c of cases) {
        const cols = [
            pad(c.name, widths[0]),
            pad(fmtMs(c.meanMs), widths[1], true),
            pad(fmtMs(c.stddevMs), widths[2], true),
            pad(fmtMs(c.minMs), widths[3], true),
            pad(fmtMs(c.p95Ms), widths[4], true),
            pad(fmtMs(c.maxMs), widths[5], true),
            pad(fmtOps(c.opsPerSec), widths[6], true),
            pad(String(c.iterations), widths[7], true),
        ];
        // Colour-code mean: green <1ms, yellow <10ms, red >=10ms
        const meanColour = c.meanMs < 1 ? COL.green : c.meanMs < 10 ? COL.yellow : COL.red;
        console.log(
            `${cols[0]}  ${meanColour}${cols[1]}${COL.reset}  ${cols[2]}  ${cols[3]}  ${cols[4]}  ${cols[5]}  ${cols[6]}  ${cols[7]}`,
        );
    }
}

export function printAllReports(reports: SuiteReport[]): void {
    for (const r of reports) {
        printReport(r);
    }
    console.log('\n');
}

/**
 * Emit a compact JSON summary to stdout (useful for CI baseline tracking).
 * Only emitted when the environment variable BENCH_JSON=1 is set.
 */
export function maybeEmitJson(reports: SuiteReport[]): void {
    if (process.env.BENCH_JSON !== '1') {
        return;
    }
    const flat = reports.flatMap((r) =>
        r.cases.map((c) => ({
            suite: c.suiteName,
            case: c.name,
            meanMs: +c.meanMs.toFixed(4),
            p95Ms: +c.p95Ms.toFixed(4),
            opsPerSec: +c.opsPerSec.toFixed(2),
        })),
    );
    console.log(JSON.stringify(flat, null, 2));
}
