import fs from 'node:fs';
import path from 'node:path';

const OUT_ROOT = path.join(__dirname, 'results');

const DEFAULT_RUNS = ['longrun-baseline', 'longrun-wo50', 'longrun-spring040', 'longrun-spring045'];
const HORIZONS = [100, 300, 600];

const HORIZON_METRICS = [
    'totalPopulation',
    'avgGroceryStarvation',
    'groceryFillRate',
    'avgFacilityCondition',
    'medianWealth',
    'bankEquity',
] as const;

const FINAL_METRICS = ['bankEquity', 'bankLoans', 'debtWriteOffs', 'bankruptcies', 'loanInterestCollected', 'governmentDebt', 'companyCount'] as const;

function arg(name: string): string | undefined {
    const prefix = `--${name}=`;
    const found = process.argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
}

interface BandResult {
    metric: string;
    horizonYears: number;
    actual: number | null;
    min?: number;
    max?: number;
    pass: boolean;
}

interface Summary {
    scenario: string;
    description: string;
    years: number;
    msPerTick: number;
    ticksPerSecond: number;
    bands: BandResult[];
    yearly: Record<string, Record<string, number>>;
}

function meanAtHorizon(
    yearly: Record<string, Record<string, number>>,
    metric: string,
    horizon: number,
    windowYears = 5,
): number | null {
    const rows: number[] = [];
    for (let y = horizon - windowYears + 1; y <= horizon; y++) {
        const value = yearly[String(y)]?.[metric];
        if (value !== undefined && Number.isFinite(value)) {
            rows.push(value);
        }
    }
    if (rows.length === 0) {
        return null;
    }
    return rows.reduce((a, b) => a + b, 0) / rows.length;
}

function fmtMetric(metric: string, value: number | null): string {
    if (value === null) {
        return '   —  ';
    }
    switch (metric) {
        case 'totalPopulation':
            return `${(value / 1_000_000).toFixed(1)}M`.padStart(8);
        case 'bankEquity':
        case 'bankLoans':
        case 'debtWriteOffs':
        case 'loanInterestCollected':
        case 'governmentDebt':
            return `${(value / 1_000_000_000).toFixed(1)}B`.padStart(8);
        case 'medianWealth':
            return value.toFixed(1).padStart(8);
        default:
            return value.toFixed(3).padStart(8);
    }
}

function main(): void {
    const runsArg = arg('runs');
    const runs = runsArg ? runsArg.split(',').map((s) => s.trim()) : DEFAULT_RUNS;

    const summaries: Array<{ name: string; summary: Summary }> = [];
    for (const name of runs) {
        const summaryPath = path.join(OUT_ROOT, name, 'summary.json');
        if (!fs.existsSync(summaryPath)) {
            console.error(`Missing ${summaryPath}`);
            process.exitCode = 1;
            continue;
        }
        const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as Summary;
        summaries.push({ name, summary });
    }
    if (summaries.length === 0) {
        process.exit(1);
    }

    for (const metric of HORIZON_METRICS) {
        console.log(`\n${metric} (mean of last 5 years):`);
        console.log('  run'.padEnd(22), HORIZONS.map((h) => `y${h}`.padStart(8)).join(''));
        for (const { name, summary } of summaries) {
            const cells = HORIZONS.map((h) => fmtMetric(metric, meanAtHorizon(summary.yearly, metric, h)));
            console.log(`  ${name.padEnd(22)}${cells.join('')}`);
        }
    }

    console.log(`\nEnd-of-run metrics (y${summaries[0]?.summary.years ?? '?'}):`);
    console.log('  ' + 'run'.padEnd(22) + FINAL_METRICS.map((m) => m.padStart(10)).join(''));
    for (const { name, summary } of summaries) {
        const finalYear = String(summary.years);
        const cells = FINAL_METRICS.map((m) => {
            const v = summary.yearly[finalYear]?.[m];
            return fmtMetric(m, v === undefined ? null : v);
        });
        console.log(`  ${name.padEnd(22)}${cells.join('')}`);
    }

    console.log('\nBand results:');
    for (const { name, summary } of summaries) {
        const line = summary.bands
            .map((b) => `${b.pass ? 'PASS' : 'FAIL'} ${b.metric}@y${b.horizonYears}=${b.actual === null ? 'n/a' : b.actual.toFixed(3)}`)
            .join('  ');
        console.log(`  ${name}: ${line}`);
    }
}

main();
