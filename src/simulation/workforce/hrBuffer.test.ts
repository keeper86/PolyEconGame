import { describe, expect, it } from 'vitest';
import { HR_BUFFER_CAPACITY_MULTIPLIER } from '../constants';
import { putIntoStorageFacility, queryStorageFacility } from '../planet/facility';
import { humanResourcesServiceResourceType } from '../planet/services';
import { PRODUCED_HR_QUANTITY } from '../planet/specialFacilities';
import { makeAgentPlanetAssets, makeHRFacility } from '../utils/testHelper';
import {
    computeBufferCapacity,
    computeMaxDailyHROutput,
    computeProductivityMultiplier,
    hrBufferStatus,
    processHrBufferForAssets,
    relaxHrStarvation,
} from './hrBuffer';

describe('computeMaxDailyHROutput', () => {
    it('returns PRODUCED_QUANTITY times scale', () => {
        expect(computeMaxDailyHROutput(1)).toBe(PRODUCED_HR_QUANTITY);
        expect(computeMaxDailyHROutput(2.5)).toBe(PRODUCED_HR_QUANTITY * 2.5);
    });
});

describe('computeBufferCapacity', () => {
    it('returns HR_BUFFER_CAPACITY_MULTIPLIER x max daily output', () => {
        expect(computeBufferCapacity(1000)).toBe(1000 * HR_BUFFER_CAPACITY_MULTIPLIER);
        expect(computeBufferCapacity(500)).toBe(500 * HR_BUFFER_CAPACITY_MULTIPLIER);
        expect(computeBufferCapacity(2000)).toBe(2000 * HR_BUFFER_CAPACITY_MULTIPLIER);
    });
});

describe('relaxHrStarvation', () => {
    it('is excited toward the deficit while the buffer is short', () => {
        expect(relaxHrStarvation(0, 1)).toBeCloseTo(0.05, 10);
        expect(relaxHrStarvation(0.05, 1)).toBeCloseTo(0.0975, 10);
    });

    it('relaxes toward the deficit as well, so it never overshoots', () => {
        expect(relaxHrStarvation(1, 0)).toBeCloseTo(0.95, 10);
        expect(relaxHrStarvation(0, 0)).toBe(0);
    });
});

describe('computeProductivityMultiplier', () => {
    it('is 1 without starvation and halves at full starvation', () => {
        expect(computeProductivityMultiplier(0)).toBe(1);
        expect(computeProductivityMultiplier(1)).toBeCloseTo(0.5, 10);
    });

    it('barely reacts until the starvation is severe', () => {
        expect(computeProductivityMultiplier(0.5)).toBeCloseTo(0.9921875, 10);
        expect(computeProductivityMultiplier(0.7)).toBeCloseTo(0.941, 3);
        expect(computeProductivityMultiplier(0.9)).toBeCloseTo(0.734, 3);
    });

    it('is monotone decreasing in starvation', () => {
        const xs = [0, 0.2, 0.4, 0.6, 0.8, 1];
        const ys = xs.map(computeProductivityMultiplier);
        for (let i = 1; i < ys.length; i++) {
            expect(ys[i]).toBeLessThanOrEqual(ys[i - 1]);
        }
    });
});

describe('hrBufferStatus', () => {
    it('returns optimal at or above 2.5x demand', () => {
        expect(hrBufferStatus(250, 100)).toBe('optimal');
        expect(hrBufferStatus(300, 100)).toBe('optimal');
    });

    it('returns stable between 1.0 and 2.5x demand', () => {
        expect(hrBufferStatus(100, 100)).toBe('stable');
        expect(hrBufferStatus(200, 100)).toBe('stable');
    });

    it('returns strained between 0.3 and 1.0', () => {
        expect(hrBufferStatus(99, 100)).toBe('strained');
        expect(hrBufferStatus(30, 100)).toBe('strained');
    });

    it('returns critical below 0.3', () => {
        expect(hrBufferStatus(29, 100)).toBe('critical');
        expect(hrBufferStatus(0, 100)).toBe('critical');
    });

    it('returns optimal when demand is zero', () => {
        expect(hrBufferStatus(0, 0)).toBe('optimal');
    });
});

describe('processHrBufferForAssets', () => {
    it('pulls HR from storage into the buffer and sets multiplier', () => {
        const hrFacility = makeHRFacility(undefined, {
            produces: [{ resource: humanResourcesServiceResourceType, quantity: PRODUCED_HR_QUANTITY }],
            maxScale: 3,
            hrBuffer: 500,
        });
        const assets = makeAgentPlanetAssets('p', {
            humanResourcesDepartment: hrFacility,
        });
        putIntoStorageFacility(assets.storage, humanResourcesServiceResourceType, 1000);

        assets.usedWorkers = 100;

        processHrBufferForAssets(assets);

        expect(queryStorageFacility(assets.storage, humanResourcesServiceResourceType.name)).toBe(0);
        expect(hrFacility.hrBuffer).toBe(1500 - 100);
    });

    it('clamps buffer at pmax', () => {
        const pMax = PRODUCED_HR_QUANTITY * 5 * HR_BUFFER_CAPACITY_MULTIPLIER;
        const hrFacility = makeHRFacility(undefined, {
            produces: [{ resource: humanResourcesServiceResourceType, quantity: PRODUCED_HR_QUANTITY }],
            maxScale: 5,
            hrBuffer: pMax - 500,
        });
        const assets = makeAgentPlanetAssets('p', {
            humanResourcesDepartment: hrFacility,
        });
        putIntoStorageFacility(assets.storage, humanResourcesServiceResourceType, 1000);

        processHrBufferForAssets(assets);
        expect(hrFacility.hrBuffer).toBe(pMax);
    });

    it('uses maxScale for buffer capacity, not current scale', () => {
        const pMax = PRODUCED_HR_QUANTITY * 2 * HR_BUFFER_CAPACITY_MULTIPLIER;
        const hrFacility = makeHRFacility(undefined, {
            produces: [{ resource: humanResourcesServiceResourceType, quantity: PRODUCED_HR_QUANTITY }],
            scale: 0.5,
            maxScale: 2,
            hrBuffer: 0,
        });
        const assets = makeAgentPlanetAssets('p', {
            humanResourcesDepartment: hrFacility,
        });
        putIntoStorageFacility(assets.storage, humanResourcesServiceResourceType, 1000);

        processHrBufferForAssets(assets);
        expect(hrFacility.hrBuffer).toBe(1000);
        expect(hrFacility.hrBuffer).toBeLessThanOrEqual(pMax);

        const hrFacility2 = makeHRFacility(undefined, {
            produces: [{ resource: humanResourcesServiceResourceType, quantity: PRODUCED_HR_QUANTITY }],
            scale: 0.5,
            maxScale: 2,
            hrBuffer: pMax - 500,
        });
        const assets2 = makeAgentPlanetAssets('p', {
            humanResourcesDepartment: hrFacility2,
        });
        putIntoStorageFacility(assets2.storage, humanResourcesServiceResourceType, 1000);

        processHrBufferForAssets(assets2);
        expect(hrFacility2.hrBuffer).toBe(pMax);
    });

    it('sets minimum productivity when there are no workers and no HR department', () => {
        const assets = makeAgentPlanetAssets('p', {
            hrProductivityMultiplier: 0.5,
        });
        processHrBufferForAssets(assets);
        expect(assets.hrProductivityMultiplier).toBe(0.5);
    });

    it('penalizes productivity when workers exist but no HR department', () => {
        const assets = makeAgentPlanetAssets('p', {
            hrProductivityMultiplier: 1,
        });
        assets.usedWorkers = 1000;

        processHrBufferForAssets(assets);
        expect(assets.hrProductivityMultiplier).toBeLessThan(1);
        expect(assets.hrProductivityMultiplier).toBe(0.5);
    });

    it('barely reacts to a single dry tick, but still reaches the floor under a sustained shortfall', () => {
        const makeAssets = () => {
            const hrFacility = makeHRFacility(undefined, {
                produces: [{ resource: humanResourcesServiceResourceType, quantity: PRODUCED_HR_QUANTITY }],
            });
            const assets = makeAgentPlanetAssets('p', {
                humanResourcesDepartment: hrFacility,
            });
            assets.usedWorkers = 1000;
            return assets;
        };

        const oneDryTick = makeAssets();
        processHrBufferForAssets(oneDryTick);
        expect(oneDryTick.hrProductivityMultiplier).toBeGreaterThan(0.99);

        const sustained = makeAssets();
        for (let tick = 0; tick < 400; tick++) {
            processHrBufferForAssets(sustained);
        }
        expect(sustained.hrProductivityMultiplier).toBeCloseTo(0.5, 2);
    });
});

describe('hrBuffer integration', () => {
    it('returns optimal when demand is zero and buffer is full', () => {
        expect(hrBufferStatus(3000, 0)).toBe('optimal');
        expect(computeProductivityMultiplier(0)).toBe(1);
    });
});
