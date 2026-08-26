export type CostSpringParams = {
    strength: number;
    reference: number;
    maxUp: number;
    maxDown: number;
};

export type SpringCurvePoint = {
    ratio: number;
    ghost: number;
    active: number;
};

const MAX_BUY_SPRING_RATIO = 20;
const SELL_DOMAIN_MIN = 0.75;

export function springPush(mode: 'buy' | 'sell', params: CostSpringParams, ratio: number): number {
    if (params.strength <= 0 || params.reference <= 0 || ratio < 0) {
        return 0;
    }
    if (mode === 'buy') {
        return ratio > params.reference ? params.strength * Math.sqrt(ratio / params.reference - 1) : 0;
    }
    return ratio < params.reference ? params.strength * Math.sqrt(params.reference / ratio - 1) : 0;
}

export function fullPush(mode: 'buy' | 'sell', params: CostSpringParams): number {
    return mode === 'buy' ? params.maxUp - 1 : 1 - params.maxDown;
}

export function springFraction(mode: 'buy' | 'sell', params: CostSpringParams, ratio: number): number {
    const full = fullPush(mode, params);
    if (full <= 0) {
        return 0;
    }
    return Math.min(1, springPush(mode, params, ratio) / full);
}

export function ratioAtFullPush(mode: 'buy' | 'sell', params: CostSpringParams): number {
    const full = fullPush(mode, params);
    if (full <= 0 || params.strength <= 0 || params.reference <= 0) {
        return NaN;
    }
    const offset = (full / params.strength) ** 2;
    if (mode === 'buy') {
        return params.reference * (1 + offset);
    }
    return params.reference / (1 + offset);
}

export function computeSpringDomain(
    mode: 'buy' | 'sell',
    ghost: CostSpringParams,
    active: CostSpringParams,
    currentRatio?: number,
    ownRatio?: number,
): { min: number; max: number } {
    if (mode === 'sell') {
        const buffer = Math.max(ghost.reference, active.reference);
        const max = Math.max(buffer, currentRatio ?? 0, ownRatio ?? 0, 1) * 1.15;
        const fullGhost = ratioAtFullPush('sell', ghost);
        const fullActive = ratioAtFullPush('sell', active);
        const lowest = Math.min(
            Number.isFinite(fullGhost) ? fullGhost : Infinity,
            Number.isFinite(fullActive) ? fullActive : Infinity,
            currentRatio ?? Infinity,
            ownRatio ?? Infinity,
        );
        return { min: lowest < SELL_DOMAIN_MIN ? 0 : SELL_DOMAIN_MIN, max };
    }
    const refs = Math.max(ghost.reference, active.reference);
    const fullGhost = ratioAtFullPush('buy', ghost);
    const fullActive = ratioAtFullPush('buy', active);
    const raw = Math.max(
        Number.isFinite(fullGhost) ? fullGhost : 0,
        Number.isFinite(fullActive) ? fullActive : 0,
        refs,
        currentRatio ?? 0,
        ownRatio ?? 0,
    );
    return { min: 0, max: Math.min(MAX_BUY_SPRING_RATIO, Math.max(2.0, raw * 1.15)) };
}

export function buildSpringRatioTicks(
    domainMin: number,
    domainMax: number,
    highlightRatios: number[],
    tickCount = 5,
): number[] {
    const count = Math.max(tickCount, 2);
    const span = domainMax - domainMin;
    const step = niceTickStep(span / (count - 1));
    if (step <= 0) {
        return [domainMin, domainMax];
    }
    const values: number[] = [];
    for (let v = domainMin; v <= domainMax - 0.99 * step; v += step) {
        values.push(roundTickValue(v));
    }
    values.push(domainMax);
    for (const ratio of highlightRatios) {
        if (ratio > domainMin && ratio < domainMax) {
            values.push(roundTickValue(ratio));
        }
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

export function buildSpringCurvePoints(
    mode: 'buy' | 'sell',
    ghost: CostSpringParams,
    active: CostSpringParams,
    domainMin: number,
    domainMax: number,
    sampleCount = 100,
): SpringCurvePoint[] {
    const points: SpringCurvePoint[] = [];
    const span = domainMax - domainMin;
    for (let i = 0; i <= sampleCount; i++) {
        const ratio = domainMin + (span / sampleCount) * i;
        points.push({
            ratio: Number(ratio.toFixed(4)),
            ghost: Number(springFraction(mode, ghost, ratio).toFixed(4)),
            active: Number(springFraction(mode, active, ratio).toFixed(4)),
        });
    }
    return points;
}
