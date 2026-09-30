import { describe, expect, it } from 'vitest';

import { educationLevelKeys } from '../population/education';
import { coalDepositResourceType } from './landBoundResources';
import { coalResourceType } from './resources';
import { administrativeServiceResourceType } from './services';
import {
    headcountPerScaleFor,
    LABOUR_PER_SERVICE_UNIT,
    LABOUR_PER_TON_PER_TICK,
    MINIMUM_WORKERS_PER_SCALE,
    workerProfiles,
    workers,
} from './workerRequirements';

const total = (requirement: Record<string, number>) =>
    educationLevelKeys.reduce((sum, edu) => sum + requirement[edu], 0);

describe('workers', () => {
    it('distributes the headcount over all education levels', () => {
        const requirement = workers(workerProfiles.extraction, 45);

        expect(total(requirement)).toBe(45);
        for (const edu of educationLevelKeys) {
            expect(Number.isInteger(requirement[edu])).toBe(true);
        }
    });

    it('follows the profile order of the education levels', () => {
        const requirement = workers(workerProfiles.highTech, 90);

        expect(requirement.tertiary).toBeGreaterThan(requirement.secondary);
        expect(requirement.secondary).toBeGreaterThan(requirement.primary);
        expect(requirement.primary).toBeGreaterThan(requirement.none);
    });

    it('keeps extraction labour mostly primary and light industry mostly secondary', () => {
        const extraction = workers(workerProfiles.extraction, 100);
        const light = workers(workerProfiles.lightIndustry, 100);

        expect(extraction.primary).toBeGreaterThan(extraction.none);
        expect(extraction.primary).toBeGreaterThan(extraction.tertiary);
        expect(light.secondary).toBeGreaterThan(light.tertiary);
        expect(light.secondary).toBeGreaterThan(light.none);
    });
});

describe('headcountPerScaleFor', () => {
    it('derives the headcount from the throughput mass of the facility', () => {
        const facility = {
            needs: [{ resource: coalResourceType, quantity: 1 }],
            produces: [{ resource: coalResourceType, quantity: 500 }],
        };

        expect(headcountPerScaleFor(facility)).toBeCloseTo(501 * LABOUR_PER_TON_PER_TICK, 10);
    });

    it('ignores source deposits, which carry no storable mass', () => {
        const facility = {
            needs: [{ resource: coalDepositResourceType, quantity: 0.5 }],
            produces: [{ resource: coalResourceType, quantity: 100 }],
        };

        expect(headcountPerScaleFor(facility)).toBeCloseTo(100 * LABOUR_PER_TON_PER_TICK, 10);
    });

    it('charges service throughput its own labour rate', () => {
        const facility = {
            needs: [],
            produces: [{ resource: administrativeServiceResourceType, quantity: 300 }],
        };

        expect(headcountPerScaleFor(facility)).toBeCloseTo(300 * LABOUR_PER_SERVICE_UNIT, 10);
    });

    it('floors every facility at a minimum crew', () => {
        const facility = {
            needs: [{ resource: coalResourceType, quantity: 1 }],
            produces: [{ resource: coalResourceType, quantity: 1 }],
        };

        expect(headcountPerScaleFor(facility)).toBe(MINIMUM_WORKERS_PER_SCALE);
    });
});

