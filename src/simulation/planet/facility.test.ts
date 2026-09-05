import { describe, expect, it } from 'vitest';

import type { Resource } from './claims';
import {
    backfillStorageShells,
    getAvailableStorageCapacity,
    putIntoStorageFacility,
    removeFromStorageFacility,
} from './facility';
import type { Storage } from './facility';
import { makeStorageFacility } from '../utils/testHelper';
import type { StorageForm } from './facility';

function makeResource(overrides?: Partial<Resource> & { form?: Resource['form'] }): Resource {
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

    it('stores nothing when storage department max scale is 0', () => {
        const resource = makeResource();
        const storage = makeStorageFacility({
            capacity: { volume: 100, mass: 100 },
            current: { volume: 50, mass: 50 },
            currentInStorage: { existing: { resource, quantity: 50 } },
        });
        storage.department = { ...storage.department!, maxScale: 0 };

        const stored = putIntoStorageFacility(storage, resource, 50);

        expect(stored).toBe(0);
        expect(storage.currentInStorage.existing.quantity).toBe(50);
        expect(storage.current.volume).toBe(50);
        expect(storage.current.mass).toBe(50);
    });
});

describe('storage form shells', () => {
    function withShellCapacity(
        form: StorageForm,
        capacity: number,
    ): {
        storage: Storage;
        resource: Resource;
    } {
        const storage = makeStorageFacility({
            capacity: { volume: 1e13, mass: 1e13 },
            current: { volume: 0, mass: 0 },
        });
        const shell = storage.shells[form];
        shell.capacity = { volume: capacity, mass: capacity };
        shell.current = { volume: 0, mass: 0 };
        const resource = makeResource({ form, volumePerQuantity: 1, massPerQuantity: 1 });
        return { storage, resource };
    }

    it('routes solid inflow to the silo shell only', () => {
        const { storage, resource } = withShellCapacity('solid', 100);
        putIntoStorageFacility(storage, resource, 40);

        expect(storage.shells.solid.current.volume).toBeCloseTo(40);
        expect(storage.shells.solid.current.mass).toBeCloseTo(40);
        expect(storage.shells.liquid.current.volume).toBe(0);
        expect(storage.shells.pieces.current.volume).toBe(0);
        expect(storage.shells.solid.capacity.volume).toBe(100);
    });

    it('form-limited shell creates a hard cap independent of other forms', () => {
        const { storage, resource: solid } = withShellCapacity('solid', 100);
        const liquid = makeResource({ form: 'liquid', volumePerQuantity: 1, massPerQuantity: 1 });

        putIntoStorageFacility(storage, solid, 100);
        // Liquid is unaffected by the full solid shell because aggregate capacity is huge.
        expect(putIntoStorageFacility(storage, liquid, 40)).toBeCloseTo(40);
        expect(putIntoStorageFacility(storage, solid, 10)).toBeCloseTo(0);
        expect(storage.shells.solid.current.volume).toBeCloseTo(100);
    });

    it('degrades inflow once a shell approaches its own capacity, independent of other forms', () => {
        const { storage, resource } = withShellCapacity('solid', 100);
        const sameForm = makeResource({ form: 'solid' });

        putIntoStorageFacility(storage, resource, 60);
        // First additional solid fits within the shell's remaining 40.
        expect(putIntoStorageFacility(storage, sameForm, 39)).toBeCloseTo(39);
        expect(storage.shells.solid.current.volume).toBeCloseTo(99);

        // Only 1 of the requested 10 fits; the rest is hard-refused by the (now full) silo.
        expect(putIntoStorageFacility(storage, sameForm, 10)).toBeCloseTo(1);
        expect(storage.shells.solid.current.volume).toBeCloseTo(100);
    });

    it('remove decrements the owning shell current', () => {
        const { storage, resource } = withShellCapacity('liquid', 1000);
        putIntoStorageFacility(storage, resource, 300);
        const removed = removeFromStorageFacility(storage, resource.name, 120);

        expect(removed).toBeCloseTo(120);
        expect(storage.shells.liquid.current.volume).toBeCloseTo(180);
        expect(storage.shells.liquid.current.mass).toBeCloseTo(180);
    });

    it('getAvailableStorageCapacity returns per-form shell room for bid capping', () => {
        const { storage, resource } = withShellCapacity('solid', 100);
        storage.currentInStorage = { already: { resource, quantity: 30 } };
        storage.shells.solid.current = { volume: 30, mass: 30 };

        const available = getAvailableStorageCapacity(storage, resource);
        expect(available).toBeCloseTo(70);
    });
});

describe('backfillStorageShells', () => {
    it('adds per-form shells to a storage facility persisted before shells existed', () => {
        const { shells: _omittedShells, ...legacyFields } = makeStorageFacility();
        const legacyStorage = legacyFields as unknown as Storage;
        expect(legacyStorage.shells).toBeUndefined();

        backfillStorageShells(legacyStorage);

        expect(legacyStorage.shells.solid.capacity.volume).toBe(1e13);
        expect(legacyStorage.shells.solid.name).toBe('Silo');
        expect(legacyStorage.shells.liquid.name).toBe('Tank');
        expect(legacyStorage.shells.pieces.name).toBe('Warehouse');
        expect(legacyStorage.shells.solid.current).toEqual({ volume: 0, mass: 0 });
    });

    it('leaves an already-upgraded storage facility untouched', () => {
        const storage = makeStorageFacility();
        const originalSilo = storage.shells.solid;
        backfillStorageShells(storage);
        expect(storage.shells.solid).toBe(originalSilo);
    });
});
