export const LOG_SCALE_SPREAD_THRESHOLD = 10;

export type LogValueAxis = {
    domain: [number, number];
    ticks: number[];
};

export function logDecadeTicks(lo: number, hi: number): number[] {
    const firstExp = Math.floor(Math.log10(lo));
    const lastExp = Math.ceil(Math.log10(hi));
    return Array.from({ length: lastExp - firstExp + 1 }, (_, i) => Math.pow(10, firstExp + i));
}

export function logAxisForRange(lo: number, hi: number): LogValueAxis {
    const ticks = logDecadeTicks(lo, hi);
    return { ticks, domain: [ticks[0], ticks[ticks.length - 1]] };
}

export function trimmedLogAxis(values: readonly number[]): LogValueAxis | null {
    const magnitudes = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    if (magnitudes.length < 2) {
        return null;
    }
    const min = magnitudes[0];
    const max = magnitudes[magnitudes.length - 1];
    const candidateLo = magnitudes[2];
    const candidateHi = magnitudes[magnitudes.length - 3];
    const canTrim = candidateLo !== undefined && candidateHi !== undefined && candidateLo < candidateHi;
    const lo = canTrim ? candidateLo : min;
    const hi = canTrim ? candidateHi : max;
    if (hi / lo <= LOG_SCALE_SPREAD_THRESHOLD) {
        return null;
    }
    return logAxisForRange(lo, hi);
}
