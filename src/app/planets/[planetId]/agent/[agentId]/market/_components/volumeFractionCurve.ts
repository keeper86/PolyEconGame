import { buyVolumeFraction, sellVolumeFraction } from '@/simulation/market/volumeFraction';

export type VolumeFractionParams = {
    floorFraction: number;
    sensitivity: number;
    inflection: number;
};

export type CurvePoint = {
    ratio: number;
    ghost: number;
    active: number;
};

export function volumeFractionAt(mode: 'buy' | 'sell', params: VolumeFractionParams, ratio: number): number {
    if (mode === 'sell') {
        return sellVolumeFraction(ratio, 1, params.sensitivity, params.floorFraction, params.inflection);
    }
    return buyVolumeFraction(ratio, 1, params.sensitivity, params.floorFraction, params.inflection);
}

export function computeVolumeFractionDomain(
    ghost: VolumeFractionParams,
    active: VolumeFractionParams,
    currentRatio?: number,
): number {
    const inflections = Math.max(ghost.inflection, active.inflection);
    const raw = Math.max(inflections, currentRatio ?? 0) * 1.6;
    return Math.max(raw, 2);
}

export function buildVolumeFractionPoints(
    mode: 'buy' | 'sell',
    ghost: VolumeFractionParams,
    active: VolumeFractionParams,
    domainMax: number,
    sampleCount = 100,
): CurvePoint[] {
    const points: CurvePoint[] = [];
    for (let i = 0; i <= sampleCount; i++) {
        const ratio = (domainMax / sampleCount) * i;
        points.push({
            ratio: Number(ratio.toFixed(4)),
            ghost: Number(volumeFractionAt(mode, ghost, ratio).toFixed(4)),
            active: Number(volumeFractionAt(mode, active, ratio).toFixed(4)),
        });
    }
    return points;
}
