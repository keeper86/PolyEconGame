import { describe, expect, it } from 'vitest';

import { educationLevelKeys } from '../population/education';
import { coalDepositResourceType } from '../planet/landBoundResources';
import { coalResourceType, produceResourceType } from '../planet/resources';
import { administrativeServiceResourceType, solidStorageServiceResourceType } from '../planet/services';
import {
    ESSENTIAL_LABOUR_FACTOR,
    headcountPerScaleFor,
    LABOUR_MULTIPLIER,
    LABOUR_PER_UNIT,
    MINIMUM_WORKERS_PER_SCALE,
    OPTIONAL_LABOUR_FACTOR,
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
    it('derives the headcount from the labour content of the throughput', () => {
        const facility = {
            needs: [{ resource: coalResourceType, quantity: 1 }],
            produces: [{ resource: coalResourceType, quantity: 500 }],
        };

        expect(headcountPerScaleFor(facility)).toBeCloseTo(
            (1 + 500) * LABOUR_PER_UNIT.raw * OPTIONAL_LABOUR_FACTOR * LABOUR_MULTIPLIER,
            10,
        );
    });

    it('ignores source deposits, which carry no labour', () => {
        const facility = {
            needs: [{ resource: coalDepositResourceType, quantity: 0.5 }],
            produces: [{ resource: coalResourceType, quantity: 100 }],
        };

        expect(headcountPerScaleFor(facility)).toBeCloseTo(
            100 * LABOUR_PER_UNIT.raw * OPTIONAL_LABOUR_FACTOR * LABOUR_MULTIPLIER,
            10,
        );
    });

    it('charges service throughput its own labour rate', () => {
        const facility = {
            needs: [],
            produces: [{ resource: administrativeServiceResourceType, quantity: 300 }],
        };

        expect(headcountPerScaleFor(facility)).toBeCloseTo(
            300 * LABOUR_PER_UNIT.services * OPTIONAL_LABOUR_FACTOR * LABOUR_MULTIPLIER,
            10,
        );
    });

    it('charges essential goods the essential labour factor, not the optional one', () => {
        const essential = {
            needs: [],
            produces: [{ resource: produceResourceType, quantity: 200 }],
        };
        const optional = {
            needs: [],
            produces: [{ resource: coalResourceType, quantity: 200 }],
        };

        expect(headcountPerScaleFor(essential) / headcountPerScaleFor(optional)).toBeCloseTo(
            ESSENTIAL_LABOUR_FACTOR / OPTIONAL_LABOUR_FACTOR,
            10,
        );
    });

    it('charges nothing for internal resources', () => {
        const facility = {
            needs: [],
            produces: [{ resource: solidStorageServiceResourceType, quantity: 500 }],
        };

        expect(headcountPerScaleFor(facility)).toBe(MINIMUM_WORKERS_PER_SCALE);
    });

    it('floors every facility at a minimum crew', () => {
        const facility = {
            needs: [{ resource: coalResourceType, quantity: 1 }],
            produces: [{ resource: coalResourceType, quantity: 1 }],
        };

        expect(headcountPerScaleFor(facility)).toBe(MINIMUM_WORKERS_PER_SCALE);
    });
});
