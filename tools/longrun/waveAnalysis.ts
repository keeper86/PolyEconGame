import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const RESULTS = join(process.cwd(), 'tools', 'longrun', 'results');
const TICKS_PER_YEAR = 360;

type Series = {
    years: number[];
    values: Map<string, Float64Array>;
};

type Args = {
    run: string;
    monthly: boolean;
    from: number;
    to: number;
    lags: number;
    burn: number;
    window: number;
    top: number;
    out: string;
    compare: string | null;
    extraCols: string[];
    all: boolean;
    quiet: boolean;
    selftest: boolean;
    laws: boolean;
    phase: boolean;
    ref: string;
};

const GROUP_CHAIN = [
    'market_Limestone_price',
    'market_Coal_price',
    'market_IronOre_price',
    'market_Steel_price',
    'market_Glass_price',
    'market_ProcessedFood_price',
    'market_Beverage_price',
    'market_Grocery_price',
    'market_Water_price',
    'market_Produce_price',
    'market_Fuel_price',
    'market_Chemical_price',
    'market_Machinery_price',
    'market_Logistics_price',
    'market_Healthcare_price',
];

const GROUP_FLOW = [
    'groceryFillRate',
    'groceryBuffer',
    'groceryTotalDemand',
    'groceryTotalSupply',
    'foodChainFillRatio',
    'groceryTotalVolume',
    'market_Grocery_volume',
    'market_Grocery_supply',
    'market_Grocery_unsold',
    'market_Grocery_demand',
    'market_Grocery_unfilled',
    'market_ProcessedFood_price',
    'market_Grocery_price',
    'facilityPriceOverCost_groceryChain',
    'facilityPriceOverCost_foodProcessor',
    'facilityScaleFrac_groceryChain',
    'facilitySignal_groceryChain',
    'facilityScaleFrac_foodProcessor',
    'facilitySignal_foodProcessor',
    'starvationMildFraction',
    'starvationSevereFraction',
    'starvationFatalFraction',
    'avgGroceryStarvation',
    'maxStorageStarvation',
    'avgStorageStarvation',
    'storageDeptScale',
];

const GROUP_MONEY = [
    'totalPopulation',
    'birthsThisMonth',
    'deathsThisMonth',
    'livingCostMonthly',
    'foodPrice',
    'wealthToFoodPrice',
    'meanWealth',
    'wealthMonthsMean',
    'wealthMonthsP10',
    'redistributedPerCapita',
    'companyWagesTotal',
    'avgWage',
    'companyAggregateProfit',
    'companyProfitMedian',
    'companyProfitP10',
    'companiesProfitable',
    'companiesNearInsolvent',
    'companiesDeepLoss',
    'bankruptcies',
    'emergencyLoansGranted',
    'wealthTaxCollected',
    'gdpAnnual',
    'workerUtilization',
    'priceLevelRaw',
    'priceLevelRefined',
    'priceLevelManufactured',
    'priceLevelServices',
    'refinedToRawPriceRatio',
    'manufacturedToRawPriceRatio',
];

const GROUP_CONTROL = [
    'priceFloorHits',
    'priceCeilHits',
    'existentialContractionIntegral',
    'nonExistentialContractionIntegral',
    'existentialAtLowerBoundFacilities',
    'nonExistentialAtLowerBoundFacilities',
    'existentialNegativeProfitFacilities',
    'expansionBlockedByProfit',
    'facilityScaleFrac_groceryChain',
    'facilityScaleFrac_foodProcessor',
    'facilityScaleFrac_beveragePlant',
    'facilityScaleFrac_glassFactory',
    'facilityScaleFrac_limestoneQuarry',
    'facilityScaleFrac_oilWell',
    'facilityScaleFrac_agriculturalFacility',
    'facilitySignal_limestoneQuarry',
    'facilitySignal_glassFactory',
    'facilitySignal_foodProcessor',
    'facilitySignal_beveragePlant',
    'facilitySignal_groceryChain',
    'facilitySignal_oilWell',
];

const DRIVERS = [...GROUP_CHAIN, ...GROUP_FLOW, ...GROUP_MONEY, ...GROUP_CONTROL];

const TRIGGER_TARGET = 'foodPrice';

type Vec = Float64Array;

const mean = (x: Vec): number => {
    let s = 0;
    for (let i = 0; i < x.length; i++) {
        s += x[i];
    }
    return x.length > 0 ? s / x.length : 0;
};

const variance = (x: Vec, mu = mean(x)): number => {
    let s = 0;
    for (let i = 0; i < x.length; i++) {
        s += (x[i] - mu) ** 2;
    }
    return x.length > 0 ? s / x.length : 0;
};

const stdDev = (x: Vec): number => Math.sqrt(variance(x));

const corr = (a: Vec, b: Vec): number => {
    const n = Math.min(a.length, b.length);
    const ma = mean(a.subarray(0, n));
    const mb = mean(b.subarray(0, n));
    let sab = 0;
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < n; i++) {
        const da = a[i] - ma;
        const db = b[i] - mb;
        sab += da * db;
        sa += da * da;
        sb += db * db;
    }
    const den = Math.sqrt(sa * sb);
    return den > 0 ? sab / den : 0;
};

const movingAverage = (x: Vec, window: number): Vec => {
    const out = new Float64Array(x.length);
    const h = Math.max(1, Math.floor(window / 2));
    for (let i = 0; i < x.length; i++) {
        const lo = Math.max(0, i - h);
        const hi = Math.min(x.length - 1, i + h);
        let s = 0;
        for (let j = lo; j <= hi; j++) {
            s += x[j];
        }
        out[i] = s / (hi - lo + 1);
    }
    return out;
};

const detrend = (x: Vec, window: number): Vec => {
    const trend = movingAverage(x, window);
    const out = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) {
        out[i] = x[i] - trend[i];
    }
    return out;
};

const linearDetrend = (x: Vec): Vec => {
    const n = x.length;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < n; i++) {
        sx += i;
        sy += x[i];
        sxx += i * i;
        sxy += i * x[i];
    }
    const den = n * sxx - sx * sx;
    const slope = den !== 0 ? (n * sxy - sx * sy) / den : 0;
    const intercept = (sy - slope * sx) / n;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        out[i] = x[i] - (intercept + slope * i);
    }
    return out;
};

const seriesRange = (x: Vec): number => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < x.length; i++) {
        min = Math.min(min, x[i]);
        max = Math.max(max, x[i]);
    }
    return max - min;
};

const acf = (x: Vec, maxLag: number): Float64Array => {
    const n = x.length;
    const mu = mean(x);
    const v = variance(x, mu);
    const out = new Float64Array(maxLag + 1);
    if (v <= 0) {
        return out;
    }
    for (let k = 0; k <= maxLag; k++) {
        let s = 0;
        for (let i = 0; i + k < n; i++) {
            s += (x[i] - mu) * (x[i + k] - mu);
        }
        out[k] = s / (n * v);
    }
    return out;
};

const hann = (n: number): Vec => {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    }
    return w;
};

const fft = (re: Vec, im: Vec): void => {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; (j & bit) !== 0; bit >>= 1) {
            j ^= bit;
        }
        j ^= bit;
        if (i < j) {
            const tr = re[i];
            re[i] = re[j];
            re[j] = tr;
            const ti = im[i];
            im[i] = im[j];
            im[j] = ti;
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len;
        const wr = Math.cos(ang);
        const wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let cr = 1;
            let ci = 0;
            for (let k = 0; k < len / 2; k++) {
                const ur = re[i + k];
                const ui = im[i + k];
                const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
                const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
                re[i + k] = ur + vr;
                im[i + k] = ui + vi;
                re[i + k + len / 2] = ur - vr;
                im[i + k + len / 2] = ui - vi;
                const ncr = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = ncr;
            }
        }
    }
};

const nextPow2 = (n: number): number => {
    let p = 1;
    while (p < n) {
        p <<= 1;
    }
    return p;
};

const powerSpectrum = (x: Vec, dt: number): { periods: number[]; power: number[] } => {
    const n = x.length;
    const mu = mean(x);
    const size = nextPow2(n * 4);
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    const w = hann(n);
    for (let i = 0; i < n; i++) {
        re[i] = (x[i] - mu) * w[i];
    }
    fft(re, im);
    const periods: number[] = [];
    const power: number[] = [];
    for (let k = 1; k <= size / 2; k++) {
        periods.push((size * dt) / k);
        power.push((re[k] * re[k] + im[k] * im[k]) / size);
    }
    return { periods, power };
};

const bandMask = (periods: number[], minPeriod: number, maxPeriod: number): number[] => {
    const idx: number[] = [];
    for (let i = 0; i < periods.length; i++) {
        if (periods[i] >= minPeriod && periods[i] <= maxPeriod) {
            idx.push(i);
        }
    }
    return idx;
};

const spectralFlatness = (periods: number[], power: number[], minPeriod: number, maxPeriod: number): number => {
    const idx = bandMask(periods, minPeriod, maxPeriod);
    if (idx.length === 0) {
        return Number.NaN;
    }
    let logSum = 0;
    let sum = 0;
    for (const i of idx) {
        const p = power[i] + 1e-300;
        logSum += Math.log(p);
        sum += p;
    }
    return Math.exp(logSum / idx.length) / (sum / idx.length);
};

const resonanceFromSpectrum = (periods: number[], power: number[]): Pole | null => {
    const idx = bandMask(periods, 4, 200);
    if (idx.length < 8) {
        return null;
    }
    let p = idx[0];
    for (const i of idx) {
        if (power[i] > power[p]) {
            p = i;
        }
    }
    if (p === idx[0] || p === idx[idx.length - 1]) {
        return null;
    }
    const peak = power[p];
    let lo = p;
    let hi = p;
    while (lo > idx[0] && power[lo] > peak / 2) {
        lo--;
    }
    while (hi < idx[idx.length - 1] && power[hi] > peak / 2) {
        hi++;
    }
    if (lo === idx[0] || hi === idx[idx.length - 1]) {
        return null;
    }
    let inBand = 0;
    let total = 0;
    for (const i of idx) {
        total += power[i];
        if (periods[i] <= periods[lo] && periods[i] >= periods[hi]) {
            inBand += power[i];
        }
    }
    const f0 = 1 / periods[p];
    const fLo = 1 / periods[lo];
    const fHi = 1 / periods[hi];
    const bandwidth = Math.abs(fHi - fLo);
    const q = bandwidth > 0 ? f0 / bandwidth : Number.POSITIVE_INFINITY;
    const damping = 1 / (2 * q);
    const omega = 2 * Math.PI * f0;
    const sigma = -damping * omega;
    return {
        period: periods[p],
        bandwidth,
        q,
        damping,
        sigma,
        magnitude: Math.exp(sigma),
        halfLife: Math.log(2) / -sigma,
        share: total > 0 ? inBand / total : Number.NaN,
    };
};

type Pole = {
    period: number;
    bandwidth: number;
    q: number;
    damping: number;
    sigma: number;
    magnitude: number;
    halfLife: number;
    share: number;
};

type Peak = { period: number; power: number; share: number };

const topPeaks = (periods: number[], power: number[], minPeriod: number, maxPeriod: number, topK: number): Peak[] => {
    const idx = bandMask(periods, minPeriod, maxPeriod);
    if (idx.length === 0) {
        return [];
    }
    let total = 0;
    for (const i of idx) {
        total += power[i];
    }
    const candidates = idx.filter((i) => {
        const prev = power[i > 0 ? i - 1 : i];
        const next = power[i + 1 < power.length ? i + 1 : i];
        return power[i] >= prev && power[i] >= next;
    });
    candidates.sort((a, b) => power[b] - power[a]);
    const picked: Peak[] = [];
    for (const i of candidates) {
        if (picked.length >= topK) {
            break;
        }
        picked.push({ period: periods[i], power: power[i], share: total > 0 ? power[i] / total : 0 });
    }
    return picked;
};

type LoadedSeries = {
    years: number[];
    index: Map<number, number>;
    values: Map<string, Float64Array>;
    dt: number;
};

const bucketKey = (tick: number, monthly: boolean): number =>
    monthly ? Math.floor(tick / 30) : Math.floor(tick / TICKS_PER_YEAR);

const loadSeries = async (dir: string, args: Args): Promise<LoadedSeries> => {
    const path = join(dir, 'series.csv');
    if (!existsSync(path)) {
        throw new Error(`no series.csv in ${dir}`);
    }
    const wanted = new Set<string>([...DRIVERS, ...args.extraCols]);
    const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    let names: string[] = [];
    let indices: number[] = [];
    const buckets = new Map<number, { sum: Float64Array; n: Float64Array }>();
    for await (const line of rl) {
        if (line.length === 0) {
            continue;
        }
        const parts = line.split(',');
        if (names.length === 0) {
            if (args.all) {
                names = parts.slice(1);
                indices = names.map((_, i) => i + 1);
            } else {
                parts.forEach((h, i) => {
                    if (i > 0 && wanted.has(h)) {
                        names.push(h);
                        indices.push(i);
                    }
                });
            }
            if (names.length === 0) {
                throw new Error('none of the requested columns exist in this run');
            }
            continue;
        }
        const tick = Number(parts[0]);
        if (!Number.isFinite(tick)) {
            continue;
        }
        const key = bucketKey(tick, args.monthly);
        let bucket = buckets.get(key);
        if (bucket === undefined) {
            bucket = { sum: new Float64Array(names.length), n: new Float64Array(names.length) };
            buckets.set(key, bucket);
        }
        for (let i = 0; i < indices.length; i++) {
            const raw = parts[indices[i]];
            if (raw === undefined || raw === '') {
                continue;
            }
            const v = Number(raw);
            if (Number.isFinite(v)) {
                bucket.sum[i] += v;
                bucket.n[i] += 1;
            }
        }
    }
    const toTime = (key: number): number => (args.monthly ? (key * 30) / TICKS_PER_YEAR : key);
    const keysFiltered = [...buckets.keys()]
        .sort((a, b) => a - b)
        .filter((k) => toTime(k) >= args.from && toTime(k) <= args.to);
    const years = keysFiltered.map(toTime);
    const index = new Map<number, number>();
    years.forEach((t, i) => index.set(Math.round(t), i));
    const values = new Map<string, Float64Array>();
    for (let c = 0; c < names.length; c++) {
        const arr = new Float64Array(keysFiltered.length);
        for (let i = 0; i < keysFiltered.length; i++) {
            const bucket = buckets.get(keysFiltered[i]);
            const n = bucket === undefined ? 0 : bucket.n[c];
            arr[i] = bucket !== undefined && n > 0 ? bucket.sum[c] / n : 0;
        }
        values.set(names[c], arr);
    }
    return { years, index, values, dt: args.monthly ? 30 / TICKS_PER_YEAR : 1 };
};

type Episode = {
    onsetYear: number;
    troughYear: number;
    depth: number;
    duration: number;
    recoveryYear: number | null;
};

const drawdownEpisodes = (years: number[], x: Vec, minDepth: number, halfWindow: number): Episode[] => {
    const n = x.length;
    const peaks: number[] = [];
    for (let i = 0; i < n; i++) {
        const lo = Math.max(0, i - halfWindow);
        const hi = Math.min(n - 1, i + halfWindow);
        let isPeak = true;
        for (let j = lo; j <= hi; j++) {
            if (x[j] > x[i]) {
                isPeak = false;
                break;
            }
        }
        if (isPeak) {
            peaks.push(i);
        }
    }
    const episodes: Episode[] = [];
    for (let p = 0; p + 1 < peaks.length; p++) {
        const a = peaks[p];
        const b = peaks[p + 1];
        let trough = a;
        for (let i = a; i <= b; i++) {
            if (x[i] < x[trough]) {
                trough = i;
            }
        }
        const depth = 1 - x[trough] / x[a];
        if (depth < minDepth) {
            continue;
        }
        let recovery: number | null = null;
        for (let i = b; i < n; i++) {
            if (x[i] >= x[a]) {
                recovery = years[i];
                break;
            }
        }
        episodes.push({
            onsetYear: years[a],
            troughYear: years[trough],
            depth,
            duration: years[trough] - years[a],
            recoveryYear: recovery,
        });
    }
    return episodes;
};

type Famine = {
    onsetYear: number;
    endYear: number;
    peakSevere: number;
    peakFatal: number;
    lengthYears: number;
};

const famineEpisodes = (years: number[], severe: Vec, fatal: Vec, severeCut: number, fatalCut: number): Famine[] => {
    const famines: Famine[] = [];
    let start = -1;
    for (let i = 0; i <= years.length; i++) {
        const hit = i < years.length && (severe[i] > severeCut || fatal[i] > fatalCut);
        if (hit && start < 0) {
            start = i;
        }
        if (!hit && start >= 0) {
            let peakSevere = 0;
            let peakFatal = 0;
            for (let j = start; j < i; j++) {
                peakSevere = Math.max(peakSevere, severe[j]);
                peakFatal = Math.max(peakFatal, fatal[j]);
            }
            famines.push({
                onsetYear: years[start],
                endYear: years[i - 1],
                peakSevere,
                peakFatal,
                lengthYears: years[i - 1] - years[start] + 1,
            });
            start = -1;
        }
    }
    return famines;
};

const zScores = (x: Vec): Vec => {
    const mu = mean(x);
    const sd = stdDev(x);
    const out = new Float64Array(x.length);
    if (sd <= 0) {
        return out;
    }
    for (let i = 0; i < x.length; i++) {
        out[i] = (x[i] - mu) / sd;
    }
    return out;
};

const leadLag = (a: Vec, b: Vec, maxLag: number): { lag: number; r: number } => {
    const n = Math.min(a.length, b.length);
    let best = { lag: 0, r: Number.NaN };
    for (let lag = -maxLag; lag <= maxLag; lag++) {
        const r =
            lag >= 0 ? corr(a.subarray(0, n - lag), b.subarray(lag, n)) : corr(a.subarray(-lag, n), b.subarray(0, n + lag));
        if (!Number.isFinite(best.r) || Math.abs(r) > Math.abs(best.r)) {
            best = { lag, r };
        }
    }
    return best;
};

const gapStats = (onsets: number[]): { mean: number; median: number; sd: number; cv: number } => {
    const gaps: number[] = [];
    for (let i = 1; i < onsets.length; i++) {
        gaps.push(onsets[i] - onsets[i - 1]);
    }
    if (gaps.length === 0) {
        return { mean: Number.NaN, median: Number.NaN, sd: Number.NaN, cv: Number.NaN };
    }
    const m = mean(Float64Array.from(gaps));
    const sd = stdDev(Float64Array.from(gaps));
    const sorted = [...gaps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return { mean: m, median, sd, cv: m > 0 ? sd / m : Number.NaN };
};

type WaveReport = {
    name: string;
    transform: 'log' | 'raw';
    levelMean: number;
    levelCv: number;
    cycleShare: number;
    cycle: Vec;
    acfNoiseBand: number;
    acfSignificantYears: number;
    acfZeroYear: number;
    acfPeakLag: number;
    acfPeakR: number;
    peaks: Peak[];
    flatness: number;
    pole: Pole | null;
    verdict: string;
};

const transformOf = (x: Vec): 'log' | 'raw' => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < x.length; i++) {
        min = Math.min(min, x[i]);
        max = Math.max(max, x[i]);
    }
    return min > 0 && max / min > 20 ? 'log' : 'raw';
};

const applyTransform = (x: Vec, transform: 'log' | 'raw'): Vec => {
    if (transform === 'raw') {
        return x;
    }
    const out = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) {
        out[i] = Math.log(Math.max(x[i], 1e-12));
    }
    return out;
};

type Fit = { a: number; b: number; r2: number; n: number };

const fitLine = (xs: number[], ys: number[]): Fit => {
    const n = Math.min(xs.length, ys.length);
    if (n < 20) {
        return { a: Number.NaN, b: Number.NaN, r2: Number.NaN, n };
    }
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
    const b = sxx > 0 ? sxy / sxx : Number.NaN;
    const a = my - b * mx;
    return { a, b, r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : Number.NaN, n };
};

const growthLaw = (x: Vec, y: Vec, dt: number): Fit => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 1; i < x.length; i++) {
        if (!(x[i] > 0) || !(x[i - 1] > 0)) {
            continue;
        }
        xs.push(y[i]);
        ys.push(Math.log(x[i] / x[i - 1]) / dt);
    }
    return fitLine(xs, ys);
};

const printLaws = (values: Map<string, Float64Array>): void => {
    const get = (name: string): Vec | null => values.get(name) ?? null;
    console.log('[7] IDENTIFIED LAWS  (monthly samples; the reduction the prediction rests on)');
    const poc = get('facilityPriceOverCost_groceryChain');
    if (poc !== null) {
        const v = [...poc].filter((x) => x > 0).sort((a, b) => a - b);
        const q = (p: number): number => v[Math.floor(p * (v.length - 1))];
        const frac = (c: number): number => v.filter((x) => x <= c).length / (v.length || 1);
        console.log(
            `  retail price/cost: median ${num(q(0.5), 2)}  p10 ${num(q(0.1), 2)}  p90 ${num(q(0.9), 2)}  share<=1.0 ${num(frac(1), 2)}  <=1.2 ${num(frac(1.2), 2)}  <=1.5 ${num(frac(1.5), 2)}`,
        );
    }
    const dt = 1 / 12;
    const capacityLaw = (
        label: string,
        scaleName: string,
        signalName: string,
    ): void => {
        const scale = get(scaleName);
        const signal = get(signalName);
        if (scale === null || signal === null) {
            return;
        }
        const fit = growthLaw(scale, signal, dt);
        console.log(
            `  ${pad(label, 34)} dln(scale)/yr = ${num(fit.a, 4)} ${fit.b >= 0 ? '+' : '-'}${num(Math.abs(fit.b), 4)}*signal   R2 ${num(fit.r2, 3)}  sd(signal) ${num(stdDev(signal), 2)}  response ${num(Math.abs(fit.b) * stdDev(signal) * 100, 1)}%/yr  n ${fit.n}`,
        );
    };
    capacityLaw('capacity law (grocery)', 'facilityScaleFrac_groceryChain', 'facilitySignal_groceryChain');
    capacityLaw('capacity law (food processor)', 'facilityScaleFrac_foodProcessor', 'facilitySignal_foodProcessor');
    const price = get('market_Grocery_price');
    const income = get('companyWagesTotal');
    const redistribution = get('redistributedPerCapita');
    const pop = get('totalPopulation');
    const demand = get('groceryTotalDemand');
    if (price !== null && income !== null && redistribution !== null && pop !== null && demand !== null) {
        const xs: number[] = [];
        const ys: number[] = [];
        for (let i = 0; i < price.length; i++) {
            const inc = income[i] / (pop[i] || Number.NaN) + redistribution[i];
            if (price[i] > 0 && demand[i] > 0 && inc > 0 && pop[i] > 0) {
                xs.push(Math.log(price[i] / inc));
                ys.push(Math.log(demand[i] / pop[i]));
            }
        }
        const fit = fitLine(xs, ys);
        console.log(
            `  ${pad('wanted demand curve', 34)} ln(demand/pop) = ${num(fit.a, 3)} ${fit.b >= 0 ? '+' : '-'}${num(Math.abs(fit.b), 3)}*ln(price/income)   R2 ${num(fit.r2, 3)}  n ${fit.n}`,
        );
    }
    if (poc !== null && price !== null) {
        const xs: number[] = [];
        const ys: number[] = [];
        for (let i = 1; i < price.length; i++) {
            const c0 = poc[i - 1] > 0 ? price[i - 1] / poc[i - 1] : Number.NaN;
            const c1 = poc[i] > 0 ? price[i] / poc[i] : Number.NaN;
            if (c0 > 0 && c1 > 0 && price[i] > 0 && price[i - 1] > 0) {
                xs.push(Math.log(c1 / c0));
                ys.push(Math.log(price[i] / price[i - 1]));
            }
        }
        const fit = fitLine(xs, ys);
        console.log(
            `  ${pad('cost pass-through', 34)} dln(price) = ${num(fit.a, 5)} + ${num(fit.b, 3)}*dln(cost)   R2 ${num(fit.r2, 3)}  n ${fit.n}`,
        );
    }
    const supply = get('market_Grocery_supply');
    const unsold = get('market_Grocery_unsold');
    if (price !== null && supply !== null && unsold !== null) {
        const xs: number[] = [];
        const ys: number[] = [];
        for (let i = 1; i < price.length; i++) {
            if (!(supply[i] > 0) || !(price[i] > 0) || !(price[i - 1] > 0)) {
                continue;
            }
            const st = Math.max(0, Math.min(1, 1 - unsold[i] / supply[i]));
            xs.push(1 - st / 1.2);
            ys.push(Math.log(price[i] / price[i - 1]));
        }
        const fit = fitLine(xs, ys);
        console.log(
            `  ${pad('price vs sell-through', 34)} dln(price) = ${num(fit.a, 5)} + ${num(fit.b, 4)}*(1-ST/1.2)   R2 ${num(fit.r2, 3)}  n ${fit.n}   (sell-through controller)`,
        );
    }
    console.log();
};

const modePeriodOf = (reports: WaveReport[], refName: string): number => {
    const ref = reports.find((r) => r.name === refName);
    if (ref === undefined) {
        return Number.NaN;
    }
    if (ref.pole !== null && Number.isFinite(ref.pole.period)) {
        return ref.pole.period;
    }
    return ref.peaks.length > 0 ? ref.peaks[0].period : Number.NaN;
};

const phaseAt = (x: Vec, dt: number, period: number): { phase: number; amplitude: number; coherence: number } => {
    const n = x.length;
    const size = nextPow2(n * 4);
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    const w = hann(n);
    let wSum = 0;
    const mu = mean(x);
    for (let i = 0; i < n; i++) {
        re[i] = (x[i] - mu) * w[i];
        wSum += w[i];
    }
    fft(re, im);
    const k = Math.max(1, Math.round((size * dt) / period));
    const phase = Math.atan2(im[k], re[k]);
    const amplitude = wSum > 0 ? (2 * Math.hypot(re[k], im[k])) / wSum : Number.NaN;
    let inBand = 0;
    let total = 0;
    for (let j = 1; j <= size / 2; j++) {
        const p = 1 / ((size * dt) / j);
        if (p < 1 / 200 || p > 1 / 4) {
            continue;
        }
        const power = (re[j] * re[j] + im[j] * im[j]) / size;
        total += power;
        if (j >= k - 1 && j <= k + 1) {
            inBand += power;
        }
    }
    return { phase, amplitude, coherence: total > 0 ? inBand / total : Number.NaN };
};

const printPhase = (reports: WaveReport[], dt: number, refName: string): void => {
    const period = modePeriodOf(reports, refName);
    console.log(`[8] PHASE AT THE MODE  (complex FFT at the dominant mode, reference ${refName})`);
    if (!Number.isFinite(period)) {
        console.log('  no dominant mode found\n');
        return;
    }
    const ref = reports.find((r) => r.name === refName);
    if (ref === undefined) {
        console.log(`  reference ${refName} not in this run\n`);
        return;
    }
    const refPhase = phaseAt(ref.cycle, dt, period);
    const rows: { name: string; delay: number; gain: number; coherence: number }[] = [];
    for (const r of reports) {
        if (r === ref) {
            continue;
        }
        const p = phaseAt(r.cycle, dt, period);
        let dphi = p.phase - refPhase.phase;
        while (dphi > Math.PI) {
            dphi -= 2 * Math.PI;
        }
        while (dphi < -Math.PI) {
            dphi += 2 * Math.PI;
        }
        rows.push({
            name: r.name,
            delay: (-dphi / (2 * Math.PI)) * period,
            gain: refPhase.amplitude > 0 ? p.amplitude / refPhase.amplitude : Number.NaN,
            coherence: p.coherence,
        });
    }
    rows.sort((a, b) => a.delay - b.delay);
    console.log(`  mode T = ${period.toFixed(1)} y; delay > 0 means the series LAGS ${refName}; one mode period = ${period.toFixed(0)} y`);
    console.log(pad('series', 36) + pad('delay y', 9) + pad('gain', 8) + 'coherence');
    for (const row of rows) {
        if (row.coherence < 0.02) {
            continue;
        }
        console.log(
            pad(row.name, 36) + pad(num(row.delay, 1), 9) + pad(num(row.gain, 2), 8) + num(row.coherence, 2),
        );
    }
    console.log('  (coherence = share of the 4-200y power inside the mode bin +/-1; <0.02 rows hidden)');
    console.log();
};


const pad = (s: string, w: number): string => (s.length > w ? s.slice(0, w) : s.padEnd(w));

const num = (v: number, digits: number): string => (Number.isFinite(v) ? v.toFixed(digits) : '-');

const printWaves = (reports: WaveReport[], years: number[]): void => {
    console.log('[1] WAVE SCAN  (cycle = linear trend removed; log used when the dynamic range is wide)');
    console.log('  levelCV% = std/|mean|, blank when the mean is ~0; cyc% = cycle std as a share of the series range');
    console.log(
        pad('series', 34) +
            pad('levelCV%', 9) +
            pad('cyc%', 7) +
            pad('acfR@lag', 12) +
            pad('acfDecay', 9) +
            pad('FFT T(share%)', 24) +
            pad('flat', 6) +
            pad('band%', 7) +
            pad('T', 6) +
            pad('rho', 7) +
            pad('zeta', 7) +
            pad('Q', 6) +
            pad('t_half', 7) +
            'verdict',
    );
    for (const r of reports) {
        console.log(
            pad(r.name, 34) +
                pad(num(r.levelCv * 100, 1), 9) +
                pad(num(r.cycleShare * 100, 1), 7) +
                pad(`${num(r.acfPeakR, 2)}@${num(r.acfPeakLag, 0)}`, 12) +
                pad(num(r.acfSignificantYears, 0), 9) +
                pad(
                    r.peaks
                        .map((p) => `${p.period.toFixed(0)}(${(p.share * 100).toFixed(0)})`)
                        .join(' '),
                    24,
                ) +
                pad(num(r.flatness, 2), 6) +
                pad(r.pole === null ? '-' : num(r.pole.share * 100, 1), 7) +
                pad(r.pole === null ? '-' : num(r.pole.period, 0), 6) +
                pad(r.pole === null ? '-' : num(r.pole.magnitude, 3), 7) +
                pad(r.pole === null ? '-' : num(r.pole.damping, 3), 7) +
                pad(r.pole === null ? '-' : num(r.pole.q, 1), 6) +
                pad(r.pole === null ? '-' : num(r.pole.halfLife, 0), 7) +
                r.verdict,
        );
    }
    console.log(
        'band% = share of the 4-200y power inside the half-power band; rho/zeta/Q/t_half = amplitude pole the resonance implies',
    );
    console.log(`acfDecay = last lag (y) with |ACF| above the 2/sqrt(N) noise band; N=${years.length} samples`);
    console.log();
};

const printFamines = (famines: Famine[], years: number[]): void => {
    console.log('[2] FAMINE CHRONOLOGY  (severeFraction > 0.05 or fatalFraction > 0.005)');
    if (famines.length === 0) {
        console.log('  none');
        console.log();
        return;
    }
    for (const f of famines) {
        console.log(
            `  onset y${num(f.onsetYear, 0).padStart(4)}  end y${num(f.endYear, 0).padStart(4)}  len ${f.lengthYears.toString().padStart(3)}y  peakSevere ${num(f.peakSevere, 3)}  peakFatal ${num(f.peakFatal, 3)}`,
        );
    }
    const stats = gapStats(famines.map((f) => f.onsetYear));
    console.log(
        `  ${famines.length} events, ${(famines.length / ((years[years.length - 1] - years[0]) / 100)).toFixed(1)} per century, gap mean ${num(stats.mean, 1)}y median ${num(stats.median, 0)}y sd ${num(stats.sd, 1)}y cv ${num(stats.cv, 2)}`,
    );
    console.log();
};

const printDrawdowns = (episodes: Episode[]): void => {
    console.log('[3] POPULATION DRAWDOWNS  (>5% peak-to-trough)');
    if (episodes.length === 0) {
        console.log('  none');
        console.log();
        return;
    }
    for (const e of episodes) {
        console.log(
            `  peak y${num(e.onsetYear, 0).padStart(4)} -> trough y${num(e.troughYear, 0).padStart(4)}  depth ${(e.depth * 100).toFixed(1)}%  ${e.duration}y  recovery ${e.recoveryYear === null ? 'never' : `y${num(e.recoveryYear, 0)}`}`,
        );
    }
    const stats = gapStats(episodes.map((e) => e.onsetYear));
    console.log(
        `  ${episodes.length} events, gap mean ${num(stats.mean, 1)}y median ${num(stats.median, 0)}y sd ${num(stats.sd, 1)}y cv ${num(stats.cv, 2)}`,
    );
    console.log();
};
const analyseSeries = (name: string, raw: Vec, window: number, maxLags: number, dt: number): WaveReport | null => {
    if (raw.length < 40) {
        return null;
    }
    if (!(stdDev(raw) > 0)) {
        return null;
    }
    const transform = transformOf(raw);
    const x = applyTransform(raw, transform);
    const xMean = Math.abs(mean(x)) < 1e-6 ? Number.NaN : Math.abs(mean(x));
    const cv = stdDev(x) / (xMean || Number.NaN);
    let cycle = linearDetrend(x);
    if (window > 0) {
        cycle = detrend(cycle, Math.round(window / dt));
    }
    const cycleStd = stdDev(cycle);
    const amplitudeShare = cycleStd / (seriesRange(x) || Number.NaN);
    const acfVals = acf(cycle, Math.min(maxLags, Math.floor(cycle.length / 3)));
    const band = 2 / Math.sqrt(cycle.length);
    let significant = 0;
    for (let k = 1; k < acfVals.length; k++) {
        if (Math.abs(acfVals[k]) > band) {
            significant = k;
        } else if (k > significant + 3) {
            break;
        }
    }
    let zero = Number.NaN;
    for (let k = 1; k < acfVals.length; k++) {
        if (acfVals[k] < 0) {
            zero = k * dt;
            break;
        }
    }
    let peakLag = 0;
    let peakR = Number.NaN;
    for (let k = 2; k < acfVals.length; k++) {
        if (
            acfVals[k] > acfVals[k - 1] &&
            acfVals[k] >= acfVals[k + 1 < acfVals.length ? k + 1 : k] &&
            (!Number.isFinite(peakR) || acfVals[k] > peakR)
        ) {
            peakR = acfVals[k];
            peakLag = k;
        }
    }
    const { periods, power } = powerSpectrum(cycle, dt);
    const peaks = topPeaks(periods, power, 4, 200, 3);
    const flatness = spectralFlatness(periods, power, 4, 200);
    const pole = resonanceFromSpectrum(periods, power);
    const cyclesInRecord = pole === null ? Number.NaN : (cycle.length * dt) / pole.period;
    const caution = Number.isFinite(cyclesInRecord) && cyclesInRecord < 4 ? ' [<4 cycles in record]' : '';
    const verdict = (() => {
        if (pole === null) {
            return significant > 10 ? 'persistent/red, no resonance' : 'flat or broadband';
        }
        if (pole.share >= 0.25 && pole.q >= 10) {
            return `high-Q resonance T=${pole.period.toFixed(0)}y Q=${pole.q.toFixed(0)}${caution}`;
        }
        if (pole.share >= 0.15 && pole.q >= 3) {
            return `resonance T=${pole.period.toFixed(0)}y Q=${pole.q.toFixed(1)}${caution}`;
        }
        if (pole.share >= 0.1) {
            return `weak periodic band T=${pole.period.toFixed(0)}y${caution}`;
        }
        return flatness > 0.35 ? 'broadband/no dominant wave' : 'damped, no wave';
    })();
    return {
        name,
        transform,
        levelMean: mean(raw),
        levelCv: cv,
        cycleShare: amplitudeShare,
        cycle,
        acfNoiseBand: band,
        acfSignificantYears: significant * dt,
        acfZeroYear: zero,
        acfPeakLag: peakLag * dt,
        acfPeakR: peakR,
        peaks,
        flatness,
        pole,
        verdict,
    };
};

const printTrigger = (reports: WaveReport[], args: Args): void => {
    const target =
        reports.find((r) => r.name === TRIGGER_TARGET) ?? reports.find((r) => r.name === 'totalPopulation');
    if (target === undefined) {
        return;
    }
    console.log(`[4] TRIGGER  (cycle cross-correlation vs ${target.name}; + lag = the driver moves first)`);
    console.log('  read as a phase inside the dominant period: a lag of k and k -/+ T are the same correlation');
    const rows = reports
        .filter((r) => r !== target)
        .map((r) => ({ name: r.name, ...leadLag(r.cycle, target.cycle, args.lags) }))
        .filter((row) => Math.abs(row.r) > 0.15)
        .sort((a, b) => b.lag - a.lag || Math.abs(b.r) - Math.abs(a.r));
    for (const row of rows) {
        console.log(`  ${pad(row.name, 36)} lag ${String(row.lag).padStart(4)}y   r ${num(row.r, 2).padStart(6)}`);
    }
    console.log();
};

const printComposite = (reports: WaveReport[], famines: Famine[], lags: number[], years: number[], dt: number): void => {
    console.log('[5] EVENT-ALIGNED COMPOSITE  (mean z-score by years from a famine onset)');
    if (famines.length === 0) {
        console.log('  no famine onsets to align on');
        console.log();
        return;
    }
    const rows = reports.map((r) => {
        const z = zScores(r.cycle);
        const vals = lags.map((lag) => {
            let sum = 0;
            let n = 0;
            for (const f of famines) {
                const i = Math.round((f.onsetYear - years[0]) / dt) + lag;
                if (i >= 0 && i < z.length) {
                    sum += z[i];
                    n += 1;
                }
            }
            return n > 0 ? sum / n : Number.NaN;
        });
        const pre = vals.filter((v, i) => lags[i] < 0 && Number.isFinite(v));
        return { name: r.name, vals, preMean: pre.length > 0 ? mean(Float64Array.from(pre)) : 0 };
    });
    rows.sort((a, b) => b.preMean - a.preMean);
    console.log(pad('series', 36) + lags.map((lag) => pad(`y${lag > 0 ? '+' : ''}${lag}`, 8)).join(''));
    for (const row of rows.slice(0, 16)) {
        console.log(pad(row.name, 36) + row.vals.map((v) => pad(num(v, 2), 8)).join(''));
    }
    console.log(`(sorted by the mean z over the ${famines.length} pre-onset windows; z>1 early = leading indicator)`);
    console.log();
};

const printDivergence = (
    nameA: string,
    yearsA: number[],
    mapA: Map<string, Float64Array>,
    nameB: string,
    yearsB: number[],
    mapB: Map<string, Float64Array>,
): void => {
    const indexB = new Map<number, number>();
    yearsB.forEach((y, i) => indexB.set(Math.round(y), i));
    const rows: { name: string; n: number; meanAbs: number; maxAbs: number; firstYear: number }[] = [];
    for (const [name, a] of mapA) {
        const b = mapB.get(name);
        if (b === undefined) {
            continue;
        }
        let sum = 0;
        let n = 0;
        let max = 0;
        let first = Number.NaN;
        for (let i = 0; i < yearsA.length; i++) {
            const j = indexB.get(Math.round(yearsA[i]));
            if (j === undefined) {
                continue;
            }
            const d = a[i] > 0 && b[j] > 0 ? Math.abs(Math.log(a[i]) - Math.log(b[j])) : (2 * Math.abs(a[i] - b[j])) / (Math.abs(a[i]) + Math.abs(b[j]) + 1e-12);
            sum += d;
            n += 1;
            max = Math.max(max, d);
            if (!Number.isFinite(first) && d > 0.05) {
                first = yearsA[i];
            }
        }
        if (n > 0) {
            rows.push({ name, n, meanAbs: sum / n, maxAbs: max, firstYear: first });
        }
    }
    rows.sort((a, b) => b.meanAbs - a.meanAbs);
    console.log(`[6] DIVERGENCE ${nameA} vs ${nameB}  (|log difference| on the common span; 0 = indistinguishable)`);
    console.log(pad('series', 36) + pad('years', 7) + pad('meanAbs', 9) + pad('maxAbs', 9) + 'firstAbs>0.05');
    for (const row of rows.slice(0, 14)) {
        console.log(
            pad(row.name, 36) +
                pad(row.n.toString(), 7) +
                pad(num(row.meanAbs, 3), 9) +
                pad(num(row.maxAbs, 2), 9) +
                (Number.isFinite(row.firstYear) ? `y${num(row.firstYear, 0)}` : '-'),
        );
    }
    console.log();
};

const COMPOSITE_LAGS = [-20, -16, -12, -8, -6, -4, -2, 0, 2];

const selfTest = (): void => {
    console.log('SELFTEST  (known spectra; the tool must report the right period, Q and "no resonance" verdict)');
    const n = 900;
    const burn = 300;
    let seed = 7;
    const noise = (): number => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648 - 0.5;
    };
    type Case = { label: string; kind: 'sine' | 'ar2' | 'ar1'; period: number; rho: number };
    const cases: Case[] = [
        { label: 'sine T=30y', kind: 'sine', period: 30, rho: 1 },
        { label: 'sine T=7y', kind: 'sine', period: 7, rho: 1 },
        { label: 'AR2 rho=0.99 T=40y', kind: 'ar2', period: 40, rho: 0.99 },
        { label: 'AR2 rho=0.98 T=20y', kind: 'ar2', period: 20, rho: 0.98 },
        { label: 'AR2 rho=0.99 T=7y', kind: 'ar2', period: 7, rho: 0.99 },
        { label: 'AR1 rho=0.98 (no cycle)', kind: 'ar1', period: Number.NaN, rho: 0.98 },
    ];
    console.log(
        pad('case', 26) + pad('want T', 8) + pad('fft T', 8) + pad('band%', 8) + pad('Q', 8) + pad('want Q', 9) + 'result',
    );
    for (const c of cases) {
        const raw = new Float64Array(n);
        if (c.kind === 'sine') {
            const omega = (2 * Math.PI) / c.period;
            for (let i = 0; i < n; i++) {
                raw[i] = 50 + 100 * Math.cos(omega * (i - n / 2)) + 2 * noise();
            }
        } else {
            const omega = c.kind === 'ar2' ? (2 * Math.PI) / c.period : 0;
            const a1 = c.kind === 'ar2' ? 2 * c.rho * Math.cos(omega) : c.rho;
            const a2 = c.kind === 'ar2' ? -c.rho * c.rho : 0;
            let x1 = 0;
            let x2 = 0;
            for (let i = 0; i < n + burn; i++) {
                const v = a1 * x1 + a2 * x2 + 2 * noise();
                x2 = x1;
                x1 = v;
                if (i >= burn) {
                    raw[i - burn] = 50 + v;
                }
            }
        }
        const report = analyseSeries('selftest', raw, 0, 80, 1);
        if (report === null) {
            console.log(`${pad(c.label, 26)}analysis returned nothing`);
            continue;
        }
        const fftT = report.peaks.length > 0 ? report.peaks[0].period : Number.NaN;
        const q = report.pole === null ? Number.NaN : report.pole.q;
        const wantQ =
            c.kind === 'ar2'
                ? 1 / (2 * (-Math.log(c.rho) / Math.sqrt(Math.log(c.rho) ** 2 + ((2 * Math.PI) / c.period) ** 2)))
                : Number.NaN;
        const ok =
            c.kind === 'ar1'
                ? report.pole === null
                : report.pole !== null && Math.abs(report.pole.period - c.period) / c.period < 0.12 && report.pole.q >= 3;
        console.log(
            pad(c.label, 26) +
                pad(c.kind === 'ar1' ? '-' : c.period.toString(), 8) +
                pad(num(fftT, 1), 8) +
                pad(report.pole === null ? '-' : num(report.pole.share * 100, 1), 8) +
                pad(num(q, 1), 8) +
                pad(num(wantQ, 1), 9) +
                (ok ? 'PASS' : 'FAIL'),
        );
    }
    const n2 = 400;
    const period = 30;
    const delay = 3;
    const first = new Float64Array(n2);
    const delayed = new Float64Array(n2);
    for (let i = 0; i < n2; i++) {
        first[i] = 100 * Math.cos((2 * Math.PI * i) / period) + 2 * noise();
        delayed[i] = 100 * Math.cos((2 * Math.PI * (i - delay)) / period) + 2 * noise();
    }
    const p1 = phaseAt(linearDetrend(first), 1, period);
    const p2 = phaseAt(linearDetrend(delayed), 1, period);
    let dphi = p2.phase - p1.phase;
    while (dphi > Math.PI) {
        dphi -= 2 * Math.PI;
    }
    while (dphi < -Math.PI) {
        dphi += 2 * Math.PI;
    }
    const recovered = (-dphi / (2 * Math.PI)) * period;
    console.log(
        `${pad('phase: sine delayed 3y', 26)}recovered ${recovered.toFixed(2)} y  gain ${(p2.amplitude / p1.amplitude).toFixed(2)}  ${Math.abs(recovered - delay) < 1 ? 'PASS' : 'FAIL'}`,
    );
};

const parseArgs = (argv: string[]): Args => {
    const args: Args = {
        run: '',
        monthly: false,
        from: 0,
        to: Number.POSITIVE_INFINITY,
        lags: 25,
        burn: 5,
        window: 0,
        top: 45,
        out: '',
        compare: null,
        extraCols: [],
        all: false,
        quiet: false,
        selftest: false,
        laws: false,
        phase: false,
        ref: 'foodPrice',
    };
    for (const a of argv) {
        if (!a.startsWith('--')) {
            if (args.run === '') {
                args.run = a;
            }
            continue;
        }
        const [key, value] = a.slice(2).split('=');
        if (key === 'selftest') {
            args.selftest = true;
        } else if (key === 'laws') {
            args.laws = true;
            args.monthly = true;
        } else if (key === 'phase') {
            args.phase = true;
        } else if (key === 'ref') {
            args.ref = value;
        } else if (key === 'monthly') {
            args.monthly = true;
        } else if (key === 'all') {
            args.all = true;
        } else if (key === 'quiet') {
            args.quiet = true;
        } else if (key === 'from') {
            args.from = Number(value);
        } else if (key === 'to') {
            args.to = Number(value);
        } else if (key === 'lags') {
            args.lags = Number(value);
        } else if (key === 'burn') {
            args.burn = Number(value);
        } else if (key === 'window') {
            args.window = Number(value);
        } else if (key === 'top') {
            args.top = Number(value);
        } else if (key === 'out') {
            args.out = value;
        } else if (key === 'compare') {
            args.compare = value;
        } else if (key === 'col') {
            args.extraCols = value
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean);
        } else {
            throw new Error(`unknown option --${key}`);
        }
    }
    if (args.run === '' && !args.selftest) {
        throw new Error(
            'usage: tsx tools/longrun/waveAnalysis.ts <result-dir|name> [--all] [--monthly] [--from=y] [--to=y] [--lags=n] [--burn=y] [--window=y] [--top=n] [--col=a,b] [--compare=run] [--out=dir] [--quiet] [--selftest]',
        );
    }
    return args;
};

type Prepared = {
    label: string;
    dir: string;
    years: number[];
    values: Map<string, Float64Array>;
    dt: number;
};

const prepare = async (run: string, args: Args): Promise<Prepared> => {
    const dir = run.includes('/') ? run : join(RESULTS, run);
    const loaded = await loadSeries(dir, args);
    const startIdx = loaded.years.findIndex((y) => y >= loaded.years[0] + args.burn);
    const cut = startIdx > 0 ? startIdx : 0;
    const values = new Map<string, Float64Array>();
    for (const [name, arr] of loaded.values) {
        values.set(name, arr.slice(cut));
    }
    return { label: run, dir, years: loaded.years.slice(cut), values, dt: loaded.dt };
};

const csvCell = (v: number | string): string =>
    typeof v === 'number' ? (Number.isFinite(v) ? v.toString() : '') : `"${v}"`;

const writeOutputs = (
    run: Prepared,
    reports: WaveReport[],
    famines: Famine[],
    drawdowns: Episode[],
    args: Args,
): void => {
    const csvDir = args.out !== '' ? args.out : join(run.dir, 'wave');
    mkdirSync(csvDir, { recursive: true });
    const waveRows = [
        'series,transform,levelCv,cycleShare,acfPeakLagY,acfPeakR,acfDecayY,peak1T,peak1Share,peak2T,peak2Share,flatness,modeBandShare,modeT,modeRho,modeZeta,modeQ,modeHalfLife,verdict',
    ];
    for (const r of reports) {
        waveRows.push(
            [
                csvCell(r.name),
                csvCell(r.transform),
                csvCell(r.levelCv),
                csvCell(r.cycleShare),
                csvCell(r.acfPeakLag),
                csvCell(r.acfPeakR),
                csvCell(r.acfSignificantYears),
                csvCell(r.peaks[0]?.period ?? Number.NaN),
                csvCell(r.peaks[0]?.share ?? Number.NaN),
                csvCell(r.peaks[1]?.period ?? Number.NaN),
                csvCell(r.peaks[1]?.share ?? Number.NaN),
                csvCell(r.flatness),
                csvCell(r.pole?.share ?? Number.NaN),
                csvCell(r.pole?.period ?? Number.NaN),
                csvCell(r.pole?.magnitude ?? Number.NaN),
                csvCell(r.pole?.damping ?? Number.NaN),
                csvCell(r.pole?.q ?? Number.NaN),
                csvCell(r.pole?.halfLife ?? Number.NaN),
                csvCell(r.verdict),
            ].join(','),
        );
    }
    writeFileSync(join(csvDir, 'waves.csv'), `${waveRows.join('\n')}\n`);
    const episodeRows = ['kind,onsetY,troughY,depth,durationY,recoveryY,peakSevere,peakFatal'];
    for (const e of drawdowns) {
        episodeRows.push(
            ['drawdown', e.onsetYear, e.troughYear, e.depth, e.duration, e.recoveryYear ?? Number.NaN, '', ''].join(','),
        );
    }
    for (const f of famines) {
        episodeRows.push(['famine', f.onsetYear, f.endYear, '', f.lengthYears, '', f.peakSevere, f.peakFatal].join(','));
    }
    writeFileSync(join(csvDir, 'episodes.csv'), `${episodeRows.join('\n')}\n`);
    const target = reports.find((r) => r.name === TRIGGER_TARGET) ?? reports.find((r) => r.name === 'totalPopulation');
    const triggerRows = ['series,lagYears,r'];
    for (const r of reports) {
        if (target !== undefined && r !== target) {
            const { lag, r: value } = leadLag(r.cycle, target.cycle, args.lags);
            triggerRows.push(`${csvCell(r.name)},${lag},${value}`);
        }
    }
    writeFileSync(join(csvDir, 'trigger.csv'), `${triggerRows.join('\n')}\n`);
    const acfRows = ['series,lagYears,acf'];
    const spectrumRows = ['series,periodYears,power'];
    for (const r of reports.slice(0, 12)) {
        acf(r.cycle, Math.min(args.lags * 2, Math.floor(r.cycle.length / 3))).forEach((v, k) =>
            acfRows.push(`${csvCell(r.name)},${(k * run.dt).toFixed(3)},${v}`),
        );
        const spectrum = powerSpectrum(r.cycle, run.dt);
        for (let i = 0; i < spectrum.periods.length; i++) {
            if (spectrum.periods[i] <= 200) {
                spectrumRows.push(`${csvCell(r.name)},${spectrum.periods[i].toFixed(3)},${spectrum.power[i]}`);
            }
        }
    }
    writeFileSync(join(csvDir, 'acf.csv'), `${acfRows.join('\n')}\n`);
    writeFileSync(join(csvDir, 'spectrum.csv'), `${spectrumRows.join('\n')}\n`);
    console.log(`wrote ${csvDir}/{waves,episodes,trigger,acf,spectrum}.csv`);
};

const main = async (): Promise<void> => {
    const args = parseArgs(process.argv.slice(2));
    if (args.selftest) {
        selfTest();
        console.log();
        if (args.run === '') {
            return;
        }
    }
    const run = await prepare(args.run, args);
    const { years, dt } = run;
    const reports: WaveReport[] = [];
    for (const [name, arr] of run.values) {
        const report = analyseSeries(name, arr, args.window, args.lags * 2, dt);
        if (report !== null) {
            reports.push(report);
        }
    }
    reports.sort((a, b) => (b.pole?.share ?? 0) - (a.pole?.share ?? 0) || b.cycleShare - a.cycleShare);
    if (!args.quiet) {
        console.log(`RUN ${run.label}`);
        console.log(
            `  ${years.length} samples of ${dt} y, span y${years[0].toFixed(0)}-y${years[years.length - 1].toFixed(0)}, burn ${args.burn} y, window ${args.window} y, ${reports.length} series`,
        );
        console.log();
        printWaves(reports.slice(0, args.top), years);
        if (reports.length > args.top) {
            console.log(
                `(showing the ${args.top} most wave-dominated of ${reports.length} series; full ranking in waves.csv, --top=n to change)`,
            );
            console.log();
        }
    }
    const severe = run.values.get('starvationSevereFraction');
    const fatal = run.values.get('starvationFatalFraction');
    const famines =
        severe !== undefined && fatal !== undefined ? famineEpisodes(years, severe, fatal, 0.05, 0.005) : [];
    const population = run.values.get('totalPopulation');
    const drawdowns = population !== undefined ? drawdownEpisodes(years, population, 0.05, 4) : [];
    if (!args.quiet) {
        printFamines(famines, years);
        printDrawdowns(drawdowns);
        printTrigger(reports, args);
        printComposite(reports, famines, COMPOSITE_LAGS, years, dt);
        if (args.laws) {
            printLaws(run.values);
        }
        if (args.phase) {
            printPhase(reports, dt, args.ref);
        }
        if (args.compare !== null) {
            const other = await prepare(args.compare, args);
            printDivergence(run.label, years, run.values, other.label, other.years, other.values);
        }
    }
    writeOutputs(run, reports, famines, drawdowns, args);
};

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
