import { describe, expect, it } from 'vitest';
import { HR_BUFFER_CAPACITY_MULTIPLIER } from '../constants';
import { makeManagementFacility, makeWorkforceCohort } from '../utils/testHelper';
import { makeAgentPlanetAssets } from '../utils/testHelper';
import { humanResourcesServiceResourceType } from '../planet/services';
import { putIntoStorageFacility } from '../planet/facility';
import { PRODUCED_QUANTITY } from '../planet/specialFacilities';
import {
    computeBufferCapacity,
    computeCoverageRatio,
    computeHrDemand,
    computeMaxDailyHROutput,
    computeProductivityMultiplier,
    hrBufferStatus,
    processHrBufferForAssets,
    updateHrBuffer,
} from './hrBuffer';

describe('computeMaxDailyHROutput', () => {
    it('returns PRODUCED_QUANTITY times scale', () => {
        expect(computeMaxDailyHROutput(1)).toBe(PRODUCED_QUANTITY);
        expect(computeMaxDailyHROutput(2.5)).toBe(PRODUCED_QUANTITY * 2.5);
    });
});

describe('computeBufferCapacity', () => {
    it('returns HR_BUFFER_CAPACITY_MULTIPLIER x max daily output', () => {
        expect(computeBufferCapacity(1000)).toBe(1000 * HR_BUFFER_CAPACITY_MULTIPLIER);
        expect(computeBufferCapacity(500)).toBe(500 * HR_BUFFER_CAPACITY_MULTIPLIER);
        expect(computeBufferCapacity(2000)).toBe(2000 * HR_BUFFER_CAPACITY_MULTIPLIER);
    });
});

describe('computeHrDemand', () => {
    it('returns 0 for empty workforce', () => {
        const workforce = makeWorkforceCohort();
        expect(computeHrDemand([workforce])).toBe(0);
    });

    it('counts active workers', () => {
        const workforce = makeWorkforceCohort();
        workforce.none.novice.active = 50;
        workforce.primary.professional.active = 25;
        expect(computeHrDemand([workforce])).toBe(75);
    });

    it('counts onboarding and departing workers', () => {
        const workforce = makeWorkforceCohort();
        workforce.none.novice.active = 10;
        workforce.none.novice.onboarding[0] = 5;
        workforce.none.novice.voluntaryDeparting[1] = 3;
        workforce.none.novice.departingFired[2] = 2;
        workforce.none.novice.departingRetired[0] = 4;
        expect(computeHrDemand([workforce])).toBe(24);
    });
});

describe('updateHrBuffer', () => {
    it('adds production and subtracts demand', () => {
        expect(updateHrBuffer(100, 500, 200, 3000)).toBe(400);
    });

    it('clamps at zero', () => {
        expect(updateHrBuffer(50, 100, 200, 3000)).toBe(0);
    });

    it('clamps at pMax', () => {
        expect(updateHrBuffer(2900, 500, 100, 3000)).toBe(3000);
    });

    it('handles zero demand', () => {
        expect(updateHrBuffer(500, 1000, 0, 3000)).toBe(1500);
    });
});

describe('computeCoverageRatio', () => {
    it('returns 1.0 when demand is zero', () => {
        expect(computeCoverageRatio(100, 0)).toBe(1.0);
        expect(computeCoverageRatio(0, 0)).toBe(1.0);
    });

    it('returns buffer divided by demand', () => {
        expect(computeCoverageRatio(200, 100)).toBe(2.0);
        expect(computeCoverageRatio(50, 100)).toBe(0.5);
    });
});

describe('computeProductivityMultiplier', () => {
    it('returns 1.0 at or above full coverage', () => {
        expect(computeProductivityMultiplier(1.0)).toBe(1.0);
        expect(computeProductivityMultiplier(2.0)).toBe(1.0);
    });

    it('uses strained formula between 0.3 and 1.0', () => {
        expect(computeProductivityMultiplier(0.5)).toBeCloseTo(0.9);
        expect(computeProductivityMultiplier(0.3)).toBeCloseTo(0.86);
        expect(computeProductivityMultiplier(0.65)).toBeCloseTo(0.93);
    });

    it('uses critical formula below 0.3', () => {
        expect(computeProductivityMultiplier(0.2)).toBeCloseTo(0.54);
        expect(computeProductivityMultiplier(0.0)).toBeCloseTo(0.5);
        expect(computeProductivityMultiplier(0.1)).toBeCloseTo(0.51);
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
        const assets = makeAgentPlanetAssets('p', {
            humanResourcesDepartment: makeManagementFacility(undefined, {
                produces: [{ resource: humanResourcesServiceResourceType, quantity: PRODUCED_QUANTITY }],
                maxScale: 3,
            }),
            hrBuffer: 500,
        });
        putIntoStorageFacility(assets.storageFacility, humanResourcesServiceResourceType, 1000);

        const workforce = assets.workforceDemography;
        workforce[30].none.novice.active = 100;

        processHrBufferForAssets(assets);

        expect(assets.storageFacility.currentInStorage[humanResourcesServiceResourceType.name]?.quantity ?? 0).toBe(0);
        expect(assets.hrBuffer).toBe(1500 - 100);
    });

    it('clamps buffer at pmax', () => {
        const pMax = PRODUCED_QUANTITY * 5 * HR_BUFFER_CAPACITY_MULTIPLIER;
        const assets = makeAgentPlanetAssets('p', {
            humanResourcesDepartment: makeManagementFacility(undefined, {
                produces: [{ resource: humanResourcesServiceResourceType, quantity: PRODUCED_QUANTITY }],
                maxScale: 5,
            }),
            hrBuffer: pMax - 500,
        });
        putIntoStorageFacility(assets.storageFacility, humanResourcesServiceResourceType, 1000);

        processHrBufferForAssets(assets);
        expect(assets.hrBuffer).toBe(pMax);
    });

    it('uses maxScale for buffer capacity, not current scale', () => {
        const pMax = PRODUCED_QUANTITY * 2 * HR_BUFFER_CAPACITY_MULTIPLIER;
        const assets = makeAgentPlanetAssets('p', {
            humanResourcesDepartment: makeManagementFacility(undefined, {
                produces: [{ resource: humanResourcesServiceResourceType, quantity: PRODUCED_QUANTITY }],
                scale: 0.5,
                maxScale: 2,
            }),
            hrBuffer: 0,
        });
        putIntoStorageFacility(assets.storageFacility, humanResourcesServiceResourceType, 1000);

        processHrBufferForAssets(assets);
        expect(assets.hrBuffer).toBe(1000);
        expect(assets.hrBuffer).toBeLessThanOrEqual(pMax);

        const assets2 = makeAgentPlanetAssets('p', {
            humanResourcesDepartment: makeManagementFacility(undefined, {
                produces: [{ resource: humanResourcesServiceResourceType, quantity: PRODUCED_QUANTITY }],
                scale: 0.5,
                maxScale: 2,
            }),
            hrBuffer: pMax - 500,
        });
        putIntoStorageFacility(assets2.storageFacility, humanResourcesServiceResourceType, 1000);

        processHrBufferForAssets(assets2);
        expect(assets2.hrBuffer).toBe(pMax);
    });

    it('keeps full productivity when there are no workers and no HR department', () => {
        const assets = makeAgentPlanetAssets('p', {
            hrBuffer: 1000,
            hrProductivityMultiplier: 0.5,
        });
        processHrBufferForAssets(assets);
        expect(assets.hrBuffer).toBe(0);
        expect(assets.hrDemand).toBe(0);
        expect(assets.hrProductivityMultiplier).toBe(1);
    });

    it('penalizes productivity when workers exist but no HR department', () => {
        const assets = makeAgentPlanetAssets('p', {
            hrBuffer: 1000,
            hrProductivityMultiplier: 1,
        });
        assets.workforceDemography[30].none.novice.active = 1000;

        processHrBufferForAssets(assets);
        expect(assets.hrBuffer).toBe(0);
        expect(assets.hrDemand).toBe(1000);
        expect(assets.hrProductivityMultiplier).toBeLessThan(1);
        expect(assets.hrProductivityMultiplier).toBe(0.5);
    });

    it('sets productivity multiplier based on coverage', () => {
        const assets = makeAgentPlanetAssets('p', {
            humanResourcesDepartment: makeManagementFacility(undefined, {
                produces: [{ resource: humanResourcesServiceResourceType, quantity: PRODUCED_QUANTITY }],
            }),
            hrBuffer: 0,
        });
        const workforce = assets.workforceDemography;
        workforce[30].none.novice.active = 1000;

        processHrBufferForAssets(assets);
        expect(assets.hrProductivityMultiplier).toBeLessThan(1);
        expect(assets.hrProductivityMultiplier).toBeGreaterThanOrEqual(0.5);
    });
});

describe('hrBuffer integration', () => {
    it('returns optimal when demand is zero and buffer is full', () => {
        const workforce = makeWorkforceCohort();
        expect(computeHrDemand([workforce])).toBe(0);
        expect(hrBufferStatus(3000, 0)).toBe('optimal');
        expect(computeProductivityMultiplier(computeCoverageRatio(3000, 0))).toBe(1);
    });
});
