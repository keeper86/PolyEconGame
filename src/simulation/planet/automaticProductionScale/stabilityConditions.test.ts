import { describe, expect, it } from 'vitest';
import {
    MIN_SCALE_FRACTION,
    PID_OUT_MAX_DOWN,
    PID_OUT_MAX_UP,
    STORAGE_CAPACITY_MONTHS,
    STORAGE_TARGET_MONTHS,
} from './constants';
import {
    assertStabilityConditions,
    checkCapacityCoversTarget,
    checkLimitCycleBand,
    checkSymmetricRateLimit,
    correctionTimeTicks,
    evaluateStabilityConditions,
    limitCycleRatio,
    predictedExcursionAmplitude,
    storageLeadTimeTicks,
} from './stabilityConditions';

describe('autoscale control-law stability conditions', () => {
    it('reports the limit-cycle band as a non-binding diagnostic', () => {
        const condition = checkLimitCycleBand();
        expect(condition.satisfied).toBe(true);
        expect(condition.detail).toContain('Non-binding');
    });

    it('derives Tp from the storage target and Tw from the rate limit', () => {
        expect(storageLeadTimeTicks()).toBe(STORAGE_TARGET_MONTHS * 30);
        expect(correctionTimeTicks()).toBeCloseTo(1 / PID_OUT_MAX_UP, 9);
    });

    it('keeps the rate limit symmetric to avoid a multi-valued describing function', () => {
        expect(PID_OUT_MAX_UP).toBe(PID_OUT_MAX_DOWN);
        expect(checkSymmetricRateLimit().satisfied).toBe(true);
    });

    it('keeps storage capacity at or above the target horizon', () => {
        expect(STORAGE_CAPACITY_MONTHS).toBeGreaterThanOrEqual(STORAGE_TARGET_MONTHS);
        expect(checkCapacityCoversTarget().satisfied).toBe(true);
    });

    it('reports every condition and does not throw while all hold', () => {
        const conditions = evaluateStabilityConditions();
        expect(conditions.map((c) => c.name)).toEqual(['limitCycleBand', 'symmetricRateLimit', 'capacityCoversTarget']);
        expect(conditions.every((c) => c.satisfied)).toBe(true);
        expect(() => assertStabilityConditions()).not.toThrow();
    });

    it('exposes the ratio the retracted band model would have computed', () => {
        expect(limitCycleRatio()).toBe(correctionTimeTicks() / storageLeadTimeTicks());
        expect(limitCycleRatio()).toBeGreaterThan(0);
    });

    it('computes the ratio the guard depends on', () => {
        expect(limitCycleRatio()).toBeCloseTo(correctionTimeTicks() / storageLeadTimeTicks(), 9);
    });

    it('exposes the amplitude the floor would allow if the loop cycles', () => {
        expect(predictedExcursionAmplitude()).toBeCloseTo(1 / MIN_SCALE_FRACTION, 9);
        expect(predictedExcursionAmplitude()).toBeGreaterThan(1);
    });
});
