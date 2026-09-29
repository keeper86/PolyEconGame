import fs from 'node:fs';
import path from 'node:path';

const OUT_ROOT = path.join(__dirname, 'results');

function arg(name: string): string | undefined {
    const prefix = `--${name}=`;
    const found = process.argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
}

interface SummaryYear {
    bankLoans: number;
    bankDeposits: number;
    bankEquity: number;
    loanInterestCollected: number;
    debtWriteOffs: number;
    gdpAnnual: number;
}

interface Summary {
    scenario: string;
    years: number;
    msPerTick: number;
    yearly: Record<string, SummaryYear | undefined>;
}

interface Derived {
    year: number;
    rEff: number;
    kappa: number;
    defaultRate: number;
    loanGrowth: number;
    ML: number;
    moneyGDP: number;
    burn: number;
    dML: number;
}

interface RunSeries {
    out: string;
    rate: number;
    seed: number;
    msPerTick: number;
    firstDefaultYear: number;
    warmupYear: number;
    derived: Derived[];
}

function mean(xs: number[]): number {
    if (xs.length === 0) {
        return NaN;
    }
    return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number {
    if (xs.length === 0) {
        return NaN;
    }
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function theilSen(xs: number[], ys: number[]): number {
    const slopes: number[] = [];
    for (let i = 0; i < xs.length; i++) {
        for (let j = i + 1; j < xs.length; j++) {
            if (xs[j] !== xs[i]) {
                slopes.push((ys[j]! - ys[i]!) / (xs[j]! - xs[i]!));
            }
        }
    }
    return median(slopes);
}

function derive(rate: number, summary: Summary): RunSeries {
    const years = Object.keys(summary.yearly)
        .map(Number)
        .filter((y) => Number.isFinite(y))
        .sort((a, b) => a - b);
    const derived: Derived[] = [];
    let prev: SummaryYear | undefined;
    for (const y of years) {
        const row = summary.yearly[String(y)];
        if (!row) {
            continue;
        }
        const dI = prev ? row.loanInterestCollected - prev.loanInterestCollected : row.loanInterestCollected;
        const dW = prev ? row.debtWriteOffs - prev.debtWriteOffs : row.debtWriteOffs;
        const dE = prev ? row.bankEquity - prev.bankEquity : row.bankEquity;
        const L = row.bankLoans;
        const prevL = prev ? prev.bankLoans : row.bankLoans;
        const ML = L > 0 ? row.bankDeposits / L : NaN;
        const prevML = prevL > 0 ? (prev ? prev.bankDeposits / prevL : ML) : NaN;
        derived.push({
            year: y,
            rEff: L > 0 ? dI / L : NaN,
            kappa: L > 0 ? dI / L / rate : NaN,
            defaultRate: L > 0 ? dW / L : NaN,
            loanGrowth: prevL > 0 ? (L - prevL) / prevL : NaN,
            ML,
            moneyGDP: row.gdpAnnual > 0 ? row.bankDeposits / row.gdpAnnual : NaN,
            burn: L > 0 ? -dE / L : NaN,
            dML: Number.isFinite(ML) && Number.isFinite(prevML) ? ML - prevML : NaN,
        });
        prev = row;
    }
    const firstDefaultYear = derived.find((d) => d.defaultRate > 0)?.year ?? -1;
    const warmupYear = firstDefaultYear > 0 ? firstDefaultYear + 10 : 0;
    return { out: '', rate, seed: 0, msPerTick: summary.msPerTick, firstDefaultYear, warmupYear, derived };
}

function windowMedian(run: RunSeries, metric: keyof Derived, fromYear: number, toYear: number): number {
    const xs = run.derived
        .filter((d) => d.year >= fromYear && d.year <= toYear)
        .map((d) => d[metric] as number)
        .filter((v) => Number.isFinite(v));
    return median(xs);
}

function postWarmupMean(run: RunSeries, metric: keyof Derived): number {
    const xs = run.derived
        .filter((d) => d.year > run.warmupYear)
        .map((d) => d[metric] as number)
        .filter((v) => Number.isFinite(v));
    return mean(xs);
}

function fmt(v: number, digits = 3): string {
    if (!Number.isFinite(v)) {
        return '   —  ';
    }
    return v.toFixed(digits).padStart(8);
}

function main(): void {
    const prefix = arg('prefix') ?? 'pilot';
    const rates = (arg('rates') ?? '0.01,0.05,0.25').split(',').map((s) => Number(s.trim()));
    const seeds = (arg('seeds') ?? '1001,1002,1003').split(',').map((s) => Number(s.trim()));
    const windowYears = Number(arg('windowYears') ?? 20);

    const runs: RunSeries[] = [];
    const runsArg = arg('runs');
    const sources: Array<{ out: string; rate: number; seed: number }> = [];
    if (runsArg) {
        for (const spec of runsArg.split(',')) {
            const [name, rateStr] = spec.split(':');
            if (!name || rateStr === undefined) {
                throw new Error(`bad --runs entry '${spec}', expected name:rate`);
            }
            const seedMatch = /-s(\d+)$/.exec(name);
            sources.push({ out: name, rate: Number(rateStr), seed: seedMatch ? Number(seedMatch[1]) : 0 });
        }
    } else {
        for (const rate of rates) {
            for (const seed of seeds) {
                sources.push({ out: `${prefix}-r${rate}-s${seed}`, rate, seed });
            }
        }
    }
    for (const source of sources) {
        const summaryPath = path.join(OUT_ROOT, source.out, 'summary.json');
        if (!fs.existsSync(summaryPath)) {
            console.error(`Missing ${summaryPath} — skipping`);
            process.exitCode = 1;
            continue;
        }
        const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as Summary;
        const run = derive(source.rate, summary);
        run.out = source.out;
        run.seed = source.seed;
        runs.push(run);
    }
    if (runs.length === 0) {
        process.exit(1);
    }
    const rateValues = [...new Set(runs.map((r) => r.rate))].sort((a, b) => a - b);

    const maxYear = Math.max(...runs.map((r) => r.derived[r.derived.length - 1]?.year ?? 0));
    const windows: Array<[number, number]> = [];
    for (let from = 1; from <= maxYear; from += windowYears) {
        windows.push([from, Math.min(from + windowYears - 1, maxYear)]);
    }

    const lines: string[] = [];
    const emit = (line: string): void => {
        console.log(line);
        lines.push(line);
    };

    emit(`# Policy-rate sweep analysis — ${prefix}`);
    emit('');
    emit(
        'Derivation: `E = L − M`, `ΔE = I + R − W` ⇒ the per-year imbalance equals `−ΔE/L` (equity burn), ' +
            'and `Δ(M/L)` is its level mirror. `R` (bankruptcy-retained + recycler destroys) is recovered as ' +
            '`R = ΔE − ΔI + ΔW`. All figures are scale-free ratios.',
    );
    emit('');

    emit('## Runs');
    emit('out                          rate   seed  firstDefault  ms/tick   M/L@end  M/GDP@end   κ@end  burn@end');
    for (const run of runs) {
        const last = run.derived[run.derived.length - 1];
        emit(
            `${run.out.padEnd(28)} ${run.rate.toFixed(4)} ${String(run.seed).padStart(5)}  ${String(run.firstDefaultYear).padStart(11)}  ${run.msPerTick.toFixed(1).padStart(7)}  ${fmt(last?.ML ?? NaN, 2)}  ${fmt(last?.moneyGDP ?? NaN, 2)}  ${fmt(last?.kappa ?? NaN, 3)}  ${fmt(last?.burn ?? NaN, 3)}`,
        );
    }
    emit('');

    emit(`## Per-rate medians across seeds, by ${windowYears}-year window`);
    emit('metric              window   ' + rateValues.map((r) => `r=${r}`.padStart(10)).join(''));
    for (const metric of ['burn', 'dML', 'ML', 'moneyGDP', 'kappa', 'defaultRate', 'loanGrowth'] as const) {
        for (const [from, to] of windows) {
            const cells = rateValues.map((rate) => {
                const xs = runs
                    .filter((r) => r.rate === rate)
                    .map((r) => windowMedian(r, metric, from, to))
                    .filter((v) => Number.isFinite(v));
                return fmt(median(xs), metric === 'ML' || metric === 'moneyGDP' ? 2 : 3);
            });
            emit(`${metric.padEnd(18)} ${String(`y${from}-${to}`).padStart(9)}  ${cells.join('')}`);
        }
    }
    emit('');

    emit('## Post-warmup `∂metric/∂rate` (per-run means, Theil–Sen median pair-slope)');
    emit('metric        slope/rate   note');
    for (const metric of ['burn', 'dML', 'ML', 'moneyGDP', 'kappa', 'defaultRate', 'loanGrowth'] as const) {
        const points = runs
            .map((r) => [r.rate, postWarmupMean(r, metric)] as const)
            .filter(([, y]) => Number.isFinite(y));
        const s = theilSen(
            points.map(([x]) => x),
            points.map(([, y]) => y),
        );
        const note =
            metric === 'burn'
                ? 'negative => higher rate reduces net money creation'
                : metric === 'dML'
                  ? 'negative => higher rate stabilises M/L'
                  : '';
        emit(`${metric.padEnd(14)} ${fmt(s, 3)}   ${note}`);
    }
    emit('');
    emit(
        'Caveat: the slopes are medians over few runs and the horizon may still contain the transient; ' +
            'runs that ended early (population extinction) bias the level metrics. Sign consistency across ' +
            'windows matters more than magnitude here.',
    );

    const reportPath = path.join(OUT_ROOT, `${prefix}-analysis.md`);
    fs.writeFileSync(reportPath, lines.join('\n') + '\n');
    console.log(`\nWrote ${reportPath}`);
}

main();

