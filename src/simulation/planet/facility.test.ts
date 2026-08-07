import { describe, expect, it } from 'vitest';

import type { Resource } from './claims';
import { putIntoStorageFacility } from './facility';
import { makeStorageFacility } from '../utils/testHelper';

function makeResource(overrides?: Partial<Resource>): Resource {
    return {
        name: 'test-resource',
        form: 'solid',
        level: 'raw',
        volumePerQuantity: 1,
        massPerQuantity: 1,
        ...overrides,
    } as Resource;
}

describe('putIntoStorageFacility', () => {
    it('does not remove stored items when storage is full', () => {
        const storage = makeStorageFacility({
            capacity: { volume: 100, mass: 100 },
            current: { volume: 100, mass: 100 },
        });
        const resource = makeResource();

        const stored = putIntoStorageFacility(storage, resource, 50);

        expect(stored).toBe(0);
        expect(storage.currentInStorage['test-resource']?.quantity ?? 0).toBe(0);
        expect(storage.current.volume).toBe(100);
        expect(storage.current.mass).toBe(100);
    });

    it('does not remove stored items when storage is overfull', () => {
        const storage = makeStorageFacility({
            capacity: { volume: 100, mass: 100 },
            current: { volume: 120, mass: 120 },
            currentInStorage: {
                existing: { resource: makeResource({ name: 'existing' }), quantity: 120 },
            },
        });
        const resource = makeResource();

        const stored = putIntoStorageFacility(storage, resource, 50);

        expect(stored).toBe(0);
        expect(storage.currentInStorage.existing.quantity).toBe(120);
        expect(storage.current.volume).toBe(120);
        expect(storage.current.mass).toBe(120);
    });

    it('stores only the quantity that fits in the remaining capacity', () => {
        const storage = makeStorageFacility({
            capacity: { volume: 100, mass: 100 },
            current: { volume: 90, mass: 90 },
        });
        const resource = makeResource();

        const stored = putIntoStorageFacility(storage, resource, 50);

        expect(stored).toBeCloseTo(10);
        expect(storage.currentInStorage['test-resource']?.quantity).toBeCloseTo(10);
        expect(storage.current.volume).toBeCloseTo(100);
        expect(storage.current.mass).toBeCloseTo(100);
    });

    it('stores nothing when storage department scale is 0', () => {
        const resource = makeResource();
        const storage = makeStorageFacility({
            capacity: { volume: 100, mass: 100 },
            current: { volume: 50, mass: 50 },
            currentInStorage: { existing: { resource, quantity: 50 } },
        });
        storage.department = { ...storage.department!, scale: 0 };

        const stored = putIntoStorageFacility(storage, resource, 50);

        expect(stored).toBe(0);
        expect(storage.currentInStorage.existing.quantity).toBe(50);
        expect(storage.current.volume).toBe(50);
        expect(storage.current.mass).toBe(50);
    });
});
