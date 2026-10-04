import { createReadStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const RESULTS = join(process.cwd(), 'tools', 'longrun', 'results');
const BASELINE = 'compfix10k-s1001';
const TICKS_PER_YEAR = 360;

const COLUMNS = [
    'tick',
    'facilityPriceOverCost_groceryChain',
    'facilityScaleFrac_groceryChain',
    'facilitySignal_groceryChain',
    'foodPrice',
    'starvationSevereFraction',
    'starvationFatalFraction',
    'maxStorageStarvation',
    'totalPopulation',
];

type Row = Record<string, number[]>;

const loadRun = async (dir: string): Promise<Row> => {
    const path = join(dir, 'series.csv');
    if (!existsSync(path)) {
        throw new Error(`no series.csv in ${dir}`);
    }
    const out: Row = {};
    for (const c of COLUMNS) {
        out[c] = [];
    }
    const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    let map: number[] = [];
    for await (const line of rl) {
        if (line.length === 0) {
            continue;
        }
        const parts = line.split(',');
        if (map.length === 0) {
            for (const c of COLUMNS) {
                map.push(parts.indexOf(c));
            }
            continue;
        }
        for (let i = 0; i < COLUMNS.length; i++) {
            const idx = map[i];
            const raw = idx >= 0 ? parts[idx] : '';
            const v = raw === undefined || raw === '' ? Number.NaN : Number(raw);
            out[COLUMNS[i]].push(Number.isFinite(v) ? v : Number.NaN);
        }
    }
    return out;
};

const median = (xs: number[]): number => {
    const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    return v.length === 0 ? Number.NaN : v[Math.floor(v.length / 2)];
};

const inWindow = (row: Row, fromY: number, toY: number, name: string): number[] => {
    const years = row.tick.map((t) => t / TICKS_PER_YEAR);
    return row[name].filter((_, i) => years[i] >= fromY && years[i] <= toY);
};

const growthFit = (scale: number[], signal: number[], years: number[]): { b: number; r2: number; n: number } => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 1; i < scale.length; i++) {
        const dt = years[i] - years[i - 1];
        if (!(scale[i] > 0) || !(scale[i - 1] > 0) || !(dt > 0) || !Number.isFinite(signal[i])) {
            continue;
        }
        xs.push(signal[i]);
        ys.push(Math.log(scale[i] / scale[i - 1]) / dt);
    }
    const n = xs.length;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
        sx += xs[i];
        sy += ys[i];
    }
    const mx = sx / n;
    const my = sy / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
        sxy += (xs[i] - mx) * (ys[i] - my);
        sxx += (xs[i] - mx) ** 2;
        syy += (ys[i] - my) ** 2;
    }
    return { b: sxx > 0 ? sxy / sxx : Number.NaN, r2: sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : Number.NaN, n };
};

const countFamines = (
    severe: number[],
    fatal: number[],
    years: number[],
    fromY: number,
    toY: number,
): { events: number; perCentury: number } => {
    const hitYears = new Map<number, boolean>();
    for (let i = 0; i < severe.length; i++) {
        if (years[i] < fromY || years[i] > toY) {
            continue;
        }
        const y = Math.floor(years[i]);
        const hit = severe[i] > 0.05 || fatal[i] > 0.005;
        hitYears.set(y, (hitYears.get(y) ?? false) || hit);
    }
    const ordered = [...hitYears.keys()].sort((a, b) => a - b);
    let events = 0;
    let prev = Number.NEGATIVE_INFINITY;
    for (const y of ordered) {
        if (hitYears.get(y) === true && y > prev + 1) {
            events += 1;
            prev = y;
        } else if (hitYears.get(y) === true) {
            prev = y;
        }
    }
    const span = (toY - fromY) / 100;
    return { events, perCentury: span > 0 ? events / span : Number.NaN };
};

type Metrics = {
    span: number;
    poc: number;
    b: number;
    r2: number;
    ratio: number;
    faminesPerCentury: number;
    events: number;
    modeT: number;
    modeQ: number;
    modeShare: number;
    sdSignal: number;
    starvP90: number;
};

const p90 = (xs: number[]): number => {
    const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    return v.length === 0 ? Number.NaN : v[Math.floor(0.9 * (v.length - 1))];
};

const stdOf = (xs: number[]): number => {
    const v = xs.filter((x) => Number.isFinite(x));
    if (v.length === 0) {
        return Number.NaN;
    }
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
};

type Check = {
    label: string;
    predicted: string;
    value: (m: Metrics, base: Metrics) => number;
    ok: (v: number) => boolean;
    falsified: (v: number) => boolean;
    minSpan?: number;
    minFromY?: number;
};

const MODE_SPAN = 120;
const LAW_SPAN = 80;

const readMode = (runName: string, fromY: number, toY: number): { t: number; q: number; share: number } => {
    if (toY - fromY < MODE_SPAN) {
        return { t: Number.NaN, q: Number.NaN, share: Number.NaN };
    }
    const out = `/tmp/predict-${runName}-${fromY}-${toY}`;
    mkdirSync(out, { recursive: true });
    execFileSync(
        'npx',
        [
            'tsx',
            'tools/longrun/waveAnalysis.ts',
            runName,
            '--quiet',
            '--top=0',
            `--from=${fromY}`,
            `--to=${toY}`,
            '--burn=0',
            `--out=${out}`,
        ],
        { cwd: process.cwd(), stdio: 'ignore' },
    );
    const csv = readFileSync(join(out, 'waves.csv'), 'utf8').split('\n');
    const header = csv[0].split(',');
    const iT = header.indexOf('modeT');
    const iQ = header.indexOf('modeQ');
    const iS = header.indexOf('modeBandShare');
    for (const line of csv.slice(1)) {
        const cells = line.split(',');
        if (cells[0] !== 'foodPrice') {
            continue;
        }
        return { t: Number(cells[iT]), q: Number(cells[iQ]), share: Number(cells[iS]) };
    }
    return { t: Number.NaN, q: Number.NaN, share: Number.NaN };
};

const lastYearOf = (row: Row): number => row.tick[row.tick.length - 1] / TICKS_PER_YEAR;

const metricsOf = (runName: string, row: Row, fromY: number, toY: number, baselineFood: number): Metrics => {
    const years = row.tick.map((t) => t / TICKS_PER_YEAR);
    const span = toY - fromY;
    const scale = inWindow(row, fromY, toY, 'facilityScaleFrac_groceryChain');
    const signal = inWindow(row, fromY, toY, 'facilitySignal_groceryChain');
    const scaleYears = years.filter((y) => y >= fromY && y <= toY);
    const fit = growthFit(scale, signal, scaleYears);
    const fam = countFamines(row.starvationSevereFraction, row.starvationFatalFraction, years, fromY, toY);
    const food = median(inWindow(row, fromY, toY, 'foodPrice'));
    const mode = readMode(runName, fromY, toY);
    return {
        span,
        poc: median(inWindow(row, fromY, toY, 'facilityPriceOverCost_groceryChain')),
        b: fit.b,
        r2: fit.r2,
        ratio: baselineFood > 0 ? food / baselineFood : Number.NaN,
        faminesPerCentury: fam.perCentury,
        events: fam.events,
        modeT: mode.t,
        modeQ: mode.q,
        modeShare: mode.share,
        sdSignal: stdOf(inWindow(row, fromY, toY, 'facilitySignal_groceryChain')),
        starvP90: p90(inWindow(row, fromY, toY, 'maxStorageStarvation')),
    };
};

const verdictOf = (check: Check, m: Metrics, base: Metrics, fromY: number): 'PASS' | 'WEAK' | 'FAIL' | 'PENDING' => {
    if ((check.minSpan ?? 0) > m.span || (check.minFromY ?? 0) > fromY) {
        return 'PENDING';
    }
    const v = check.value(m, base);
    if (!Number.isFinite(v)) {
        return 'PENDING';
    }
    if (check.ok(v)) {
        return 'PASS';
    }
    return check.falsified(v) ? 'FAIL' : 'WEAK';
};

const ARM_CHECKS: Record<string, Check[]> = {
    floor12: [
        {
            label: 'p/cost ratio vs baseline',
            predicted: '0.79 (0.72-0.88)',
            value: (m, b) => m.poc / b.poc,
            ok: (v) => v >= 0.72 && v <= 0.88,
            falsified: (v) => v < 0.66 || v > 0.95,
            minFromY: 80,
        },
        {
            label: 'capacity b ratio (gate open)',
            predicted: '>= 0.8',
            value: (m, b) => m.b / b.b,
            ok: (v) => v >= 0.8,
            falsified: (v) => v < 0.55,
            minSpan: LAW_SPAN,
        },
        {
            label: 'capacity R2 ratio (gate open)',
            predicted: '>= 0.85',
            value: (m, b) => m.r2 / b.r2,
            ok: (v) => v >= 0.85,
            falsified: (v) => v < 0.7,
            minSpan: LAW_SPAN,
        },
        {
            label: 'food price vs baseline',
            predicted: '-20 +/- 8 %',
            value: (m) => (m.ratio - 1) * 100,
            ok: (v) => v >= -28 && v <= -12,
            falsified: (v) => v < -35 || v > -5,
            minFromY: 80,
        },
        {
            label: 'mode T ratio',
            predicted: '1.15 (lengthens)',
            value: (m, b) => m.modeT / b.modeT,
            ok: (v) => v >= 1.0 && v <= 1.3,
            falsified: (v) => v < 0.85,
            minSpan: MODE_SPAN,
        },
        {
            label: 'mode Q ratio',
            predicted: '<= 0.85',
            value: (m, b) => m.modeQ / b.modeQ,
            ok: (v) => v <= 0.85,
            falsified: (v) => v > 1.1,
            minSpan: MODE_SPAN,
        },
        {
            label: 'famine onsets vs baseline',
            predicted: '<= baseline in window',
            value: (m, b) => m.faminesPerCentury / b.faminesPerCentury,
            ok: (v) => v <= 1.0,
            falsified: (v) => v >= 1.5,
            minSpan: 60,
        },
    ],
    floor10: [
        {
            label: 'p/cost ratio vs baseline',
            predicted: '0.66 (0.60-0.72)',
            value: (m, b) => m.poc / b.poc,
            ok: (v) => v >= 0.6 && v <= 0.72,
            falsified: (v) => v < 0.55 || v > 0.78,
            minFromY: 80,
        },
        {
            label: 'capacity b ratio (gate shut)',
            predicted: '<= 0.6',
            value: (m, b) => m.b / b.b,
            ok: (v) => v <= 0.6,
            falsified: (v) => v >= 0.85,
            minSpan: LAW_SPAN,
        },
        {
            label: 'capacity R2 ratio (gate shut)',
            predicted: '<= 0.7',
            value: (m, b) => m.r2 / b.r2,
            ok: (v) => v <= 0.7,
            falsified: (v) => v >= 0.9,
            minSpan: LAW_SPAN,
        },
        {
            label: 'food price vs baseline',
            predicted: '-33 +/- 10 %',
            value: (m) => (m.ratio - 1) * 100,
            ok: (v) => v >= -43 && v <= -23,
            falsified: (v) => v < -45 || v > -20,
            minFromY: 80,
        },
        {
            label: 'mode T ratio',
            predicted: '>= 1.3 (slower)',
            value: (m, b) => m.modeT / b.modeT,
            ok: (v) => v >= 1.3,
            falsified: (v) => v < 1.05,
            minSpan: MODE_SPAN,
        },
        {
            label: 'mode Q ratio',
            predicted: '<= 0.65',
            value: (m, b) => m.modeQ / b.modeQ,
            ok: (v) => v <= 0.65,
            falsified: (v) => v > 0.8,
            minSpan: MODE_SPAN,
        },
        {
            label: 'famine onsets vs baseline',
            predicted: '<= baseline in window',
            value: (m, b) => m.faminesPerCentury / b.faminesPerCentury,
            ok: (v) => v <= 1.0,
            falsified: (v) => v >= 1.5,
            minSpan: 60,
        },
    ],
    zoom2: [
        {
            label: 'p/cost ratio (unchanged)',
            predicted: '1.00 (0.95-1.05)',
            value: (m, b) => m.poc / b.poc,
            ok: (v) => v >= 0.95 && v <= 1.05,
            falsified: (v) => v < 0.9 || v > 1.1,
            minFromY: 80,
        },
        {
            label: 'capacity b ratio (halved)',
            predicted: '0.5 (0.35-0.65)',
            value: (m, b) => m.b / b.b,
            ok: (v) => v >= 0.35 && v <= 0.65,
            falsified: (v) => v < 0.25 || v > 0.8,
            minSpan: LAW_SPAN,
        },
        {
            label: 'food price (unchanged)',
            predicted: '-5..+5 %',
            value: (m) => (m.ratio - 1) * 100,
            ok: (v) => v >= -5 && v <= 5,
            falsified: (v) => v < -12 || v > 12,
            minFromY: 80,
        },
        {
            label: 'mode T ratio',
            predicted: '1.1-1.5 (slower)',
            value: (m, b) => m.modeT / b.modeT,
            ok: (v) => v >= 1.1 && v <= 1.5,
            falsified: (v) => v < 1.0 || v > 1.7,
            minSpan: MODE_SPAN,
        },
        {
            label: 'mode Q ratio',
            predicted: '<= 0.75',
            value: (m, b) => m.modeQ / b.modeQ,
            ok: (v) => v <= 0.75,
            falsified: (v) => v > 0.9,
            minSpan: MODE_SPAN,
        },
    ],
    pairhx: [
        {
            label: 'signal sd ratio (noisier)',
            predicted: '>= 1.05',
            value: (m, b) => m.sdSignal / b.sdSignal,
            ok: (v) => v >= 1.05,
            falsified: (v) => v <= 0.95,
            minSpan: LAW_SPAN,
        },
        {
            label: 'capacity b ratio (gain up)',
            predicted: '>= 1.05',
            value: (m, b) => m.b / b.b,
            ok: (v) => v >= 1.05,
            falsified: (v) => v <= 0.95,
            minSpan: LAW_SPAN,
        },
        {
            label: 'storage starvation p90 ratio',
            predicted: '>= 1.0 (worse)',
            value: (m, b) => m.starvP90 / b.starvP90,
            ok: (v) => v >= 1.0,
            falsified: (v) => v < 0.9,
            minSpan: LAW_SPAN,
        },
        {
            label: 'mode T ratio (unchanged)',
            predicted: '0.85-1.15',
            value: (m, b) => m.modeT / b.modeT,
            ok: (v) => v >= 0.85 && v <= 1.15,
            falsified: (v) => v < 0.75 || v > 1.25,
            minSpan: MODE_SPAN,
        },
        {
            label: 'mode Q ratio (unchanged)',
            predicted: '0.85-1.15',
            value: (m, b) => m.modeQ / b.modeQ,
            ok: (v) => v >= 0.85 && v <= 1.15,
            falsified: (v) => v < 0.75 || v > 1.25,
            minSpan: MODE_SPAN,
        },
        {
            label: 'famine onsets vs control',
            predicted: '<= 1.0',
            value: (m, b) => m.faminesPerCentury / (b.faminesPerCentury || Number.NaN),
            ok: (v) => v <= 1.0,
            falsified: (v) => v >= 1.5,
            minSpan: 60,
        },
    ],
    pairlm: [
        {
            label: 'capacity b ratio (gate opens more)',
            predicted: '>= 1.1',
            value: (m, b) => m.b / b.b,
            ok: (v) => v >= 1.1,
            falsified: (v) => v <= 1.0,
            minSpan: LAW_SPAN,
        },
        {
            label: 'mode Q ratio (lag fixed)',
            predicted: '<= 0.9',
            value: (m, b) => m.modeQ / b.modeQ,
            ok: (v) => v <= 0.9,
            falsified: (v) => v >= 1.25,
            minSpan: MODE_SPAN,
        },
        {
            label: 'mode T ratio',
            predicted: '0.85-1.15',
            value: (m, b) => m.modeT / b.modeT,
            ok: (v) => v >= 0.85 && v <= 1.15,
            falsified: (v) => v < 0.7 || v > 1.3,
            minSpan: MODE_SPAN,
        },
        {
            label: 'famine onsets vs control',
            predicted: '<= 1.0',
            value: (m, b) => m.faminesPerCentury / (b.faminesPerCentury || Number.NaN),
            ok: (v) => v <= 1.0,
            falsified: (v) => v >= 1.5,
            minSpan: 60,
        },
    ],
};

const main = async (): Promise<void> => {
    const argv = process.argv.slice(2);
    const fromY = Number(argv.find((a) => a.startsWith('--from='))?.slice(7) ?? 20);
    const toYArg = Number(argv.find((a) => a.startsWith('--to='))?.slice(5) ?? 80);
    const runs = argv.filter((a) => !a.startsWith('--'));
    const baselineName = argv.find((a) => a.startsWith('--baseline='))?.slice(11) ?? BASELINE;
    const list =
        runs.length > 0
            ? runs
            : ['floor12-s1001', 'floor12-s1002', 'floor10-s1001', 'floor10-s1002', 'zoom2-s1001'];
    const rows = new Map<string, Row>();
    for (const name of [baselineName, ...list]) {
        rows.set(name, await loadRun(join(RESULTS, name)));
    }
    const baselineRow = rows.get(baselineName);
    if (baselineRow === undefined) {
        throw new Error('baseline missing');
    }
    console.log(
        'PREDICTION CHECK  each arm vs the baseline over the SAME window.\nThis is the fix for the window-mixing bug found at y50: the baseline foodPrice mode is T 10.2/Q 3.8 over y20-150\nbut T 14.2/Q 8.0 over y20-249, so only same-window ratios are meaningful.\n',
    );
    const tally = { PASS: 0, WEAK: 0, FAIL: 0, PENDING: 0 };
    for (const run of list) {
        if (run === baselineName) {
            continue;
        }
        const checks = ARM_CHECKS[run.split('-')[0]];
        const row = rows.get(run);
        if (checks === undefined || row === undefined) {
            console.log(`${run}: no pre-registered predictions\n`);
            continue;
        }
        const toY = Math.min(toYArg, lastYearOf(row));
        if (toY <= fromY + 10) {
            console.log(
                `${run}: window y${fromY}-${toYArg} not reached (run is at y${toY.toFixed(0)}) — PENDING\n`,
            );
            continue;
        }
        const baselineFood = median(inWindow(baselineRow, fromY, toY, 'foodPrice'));
        const m = metricsOf(run, row, fromY, toY, baselineFood);
        const base = metricsOf(baselineName, baselineRow, fromY, toY, baselineFood);
        console.log(`window y${fromY}-${toY.toFixed(0)}   ${run} vs ${baselineName}`);
        console.log(
            `  baseline  p/cost ${base.poc.toFixed(2)} | cap b ${base.b.toFixed(3)} R2 ${base.r2.toFixed(3)} | foodPrice ${baselineFood.toFixed(2)} | famines ${base.events} (${base.faminesPerCentury.toFixed(1)}/cent) | mode T ${Number.isFinite(base.modeT) ? base.modeT.toFixed(1) : '-'} Q ${Number.isFinite(base.modeQ) ? base.modeQ.toFixed(1) : '-'}`,
        );
        for (const check of checks) {
            const verdict = verdictOf(check, m, base, fromY);
            tally[verdict] += 1;
            console.log(
                `  ${verdict.padEnd(7)} ${check.label.padEnd(30)} measured ${Number(check.value(m, base)).toFixed(3).padStart(8)}   predicted ${check.predicted}`,
            );
        }
        console.log(
            `  arm       p/cost ${m.poc.toFixed(2)} | cap b ${m.b.toFixed(3)} R2 ${m.r2.toFixed(3)} | foodPrice ratio ${m.ratio.toFixed(3)} | famines ${m.events} (${m.faminesPerCentury.toFixed(1)}/cent) | mode T ${Number.isFinite(m.modeT) ? m.modeT.toFixed(1) : '-'} Q ${Number.isFinite(m.modeQ) ? m.modeQ.toFixed(1) : '-'}\n`,
        );
    }
    console.log(`TOTAL  PASS ${tally.PASS}  WEAK ${tally.WEAK}  FAIL ${tally.FAIL}  PENDING ${tally.PENDING}`);
};

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
