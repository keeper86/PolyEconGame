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

export function buildPriceRatioTicks(domainMax: number, currentRatio?: number, tickCount = 5): number[] {
    const count = Math.max(tickCount, 2);
    const step = niceTickStep(domainMax / (count - 1));
    if (step <= 0) {
        return [0, domainMax];
    }
    const values: number[] = [];
    for (let v = 0; v <= domainMax - 0.99 * step; v += step) {
        values.push(roundTickValue(v));
    }
    values.push(domainMax);
    if (currentRatio !== undefined && currentRatio > 0 && currentRatio < domainMax) {
        values.push(roundTickValue(currentRatio));
    }
    return [...new Set(values)].sort((a, b) => a - b);
}

function niceTickStep(roughStep: number): number {
    if (roughStep <= 0) {
        return 0;
    }
    const digitCount = Math.floor(Math.log10(roughStep)) + 1;
    const digitCountValue = 10 ** digitCount;
    const stepRatio = roughStep / digitCountValue;
    const stepRatioScale = digitCount !== 1 ? 0.05 : 0.1;
    const amendStepRatio = Math.ceil(stepRatio / stepRatioScale) * stepRatioScale;
    return amendStepRatio * digitCountValue;
}

function roundTickValue(value: number): number {
    return Number(value.toFixed(6));
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
