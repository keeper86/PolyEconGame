import { TICKS_PER_YEAR } from '../../src/simulation/constants';
import { METRIC_KEYS, type MetricMap } from './metrics';

export function toCsv(rows: MetricMap[]): string {
    const header = METRIC_KEYS.join(',');
    const lines = rows.map((row) => METRIC_KEYS.map((k) => row[k] ?? '').join(','));
    return [header, ...lines].join('\n');
}

export function yearlySeries(monthly: MetricMap[]): Map<number, MetricMap> {
    const years = new Map<number, MetricMap>();
    const sums = new Map<number, Record<string, number>>();
    const counts = new Map<number, number>();

    for (const sample of monthly) {
        const year = Math.floor((sample.tick - 1) / TICKS_PER_YEAR) + 1;
        if (!sums.has(year)) {
            sums.set(year, {});
            counts.set(year, 0);
        }
        const acc = sums.get(year)!;
        for (const key of METRIC_KEYS) {
            if (key === 'tick') {
                continue;
            }
            acc[key] = (acc[key] ?? 0) + (sample[key] ?? 0);
        }
        counts.set(year, counts.get(year)! + 1);
    }

    for (const [year, acc] of sums) {
        const n = counts.get(year)!;
        const mean: MetricMap = { tick: year };
        for (const key of METRIC_KEYS) {
            if (key === 'tick') {
                continue;
            }
            mean[key] = (acc[key] ?? 0) / n;
        }
        years.set(year, mean);
    }
    return years;
}

export function formatDuration(ms: number): string {
    const totalSeconds = Math.round(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}h${minutes}m${seconds}s`;
    }
    if (minutes > 0) {
        return `${minutes}m${seconds}s`;
    }
    return `${seconds}s`;
}

export function printYearly(yearly: Map<number, MetricMap>, keys: string[]): void {
    const years = [1, 5, 10, 15, 20, 25, 30].filter((y) => yearly.has(y));
    const header = ['metric', ...years.map((y) => `y${y}`)].join('\t');
    console.log(header);
    for (const key of keys) {
        if (key === 'tick') {
            continue;
        }
        const cells = years.map((y) => {
            const v = yearly.get(y)?.[key] ?? 0;
            return Number.isFinite(v) ? v.toFixed(3) : 'n/a';
        });
        console.log([key, ...cells].join('\t'));
    }
}

export function printSeries(yearly: Map<number, MetricMap>, keys: string[]): void {
    const years = [...yearly.keys()].sort((a, b) => a - b);
    const header = ['metric', ...years.map((y) => `y${y}`)].join('\t');
    console.log(header);
    for (const key of keys) {
        if (key === 'tick') {
            continue;
        }
        const cells = years.map((y) => {
            const v = yearly.get(y)?.[key] ?? 0;
            return Number.isFinite(v) ? v.toFixed(4) : 'n/a';
        });
        console.log([key, ...cells].join('\t'));
    }
}
