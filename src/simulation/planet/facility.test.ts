import { beforeEach, describe, expect, it } from 'vitest';

import type { Resource } from './claims';
import {
    getAvailableStorageCapacity,
    makeStorageShell,
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
    let storage: Storage;

    beforeEach(() => {
        storage = makeStorageFacility();
    });

    it('stores nothing when the owning shell has not been expanded (scale 0)', () => {
        storage.currentInStorage = {};
        storage.shells = {
            solid: makeStorageShell(storage.planetId, 'silo', 'solid', { volume: 1e13, mass: 1e13 }, 0),
            liquid: makeStorageShell(storage.planetId, 'tank', 'liquid', { volume: 1e13, mass: 1e13 }),
            pieces: makeStorageShell(storage.planetId, 'ware', 'pieces', { volume: 1e13, mass: 1e13 }),
        };
        const resource = makeResource();
        storage.shells.solid.compartments[resource.name] = { share: 1 };

        const stored = putIntoStorageFacility(storage, resource, 50);

        expect(stored).toBe(0);
        expect(storage.currentInStorage['test-resource']?.quantity ?? 0).toBe(0);
    });

    it('does not store more of a product than its authored compartment allows', () => {
        const resource = makeResource({ name: 'concrete' });
        const cap = 100;
        storage.shells.solid.capacity = { volume: cap, mass: cap };
        storage.shells.solid.current = { volume: 0, mass: 0 };
        storage.shells.solid.compartments[resource.name] = { share: 0.5 };
        putIntoStorageFacility(storage, resource, 50);
        expect(storage.currentInStorage[resource.name]?.quantity).toBeCloseTo(50);
        expect(putIntoStorageFacility(storage, resource, 100)).toBeCloseTo(0);
        expect(storage.currentInStorage[resource.name]?.quantity).toBeCloseTo(50);
    });

    it('a full compartment of one product does not crowd another product compartment', () => {
        const solid = makeResource({ name: 'concrete', form: 'solid' });
        const cap = 100;
        storage.shells.solid.capacity = { volume: cap, mass: cap };
        storage.shells.solid.current = { volume: 0, mass: 0 };
        storage.shells.solid.compartments[solid.name] = { share: 0.5 };
        putIntoStorageFacility(storage, solid, 50);
        expect(storage.currentInStorage[solid.name]?.quantity).toBeCloseTo(50);

        const other = makeResource({ name: 'other', form: 'solid' });
        storage.shells.solid.compartments[other.name] = { share: 0.5 };
        expect(putIntoStorageFacility(storage, other, 50)).toBeCloseTo(50);
        expect(storage.currentInStorage[other.name]?.quantity).toBeCloseTo(50);
    });

    it('caps a put at the remaining room of the product compartment', () => {
        const resource = makeResource({ name: 'concrete' });
        const cap = 100;
        storage.shells.solid.capacity = { volume: cap, mass: cap };
        storage.shells.solid.current = { volume: 0, mass: 0 };
        storage.shells.solid.compartments[resource.name] = { share: 0.5 };
        putIntoStorageFacility(storage, resource, 30);
        expect(putIntoStorageFacility(storage, resource, 50)).toBeCloseTo(20);
        expect(storage.currentInStorage[resource.name]?.quantity).toBeCloseTo(50);
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
        const storage = makeStorageFacility();
        const shell = storage.shells[form];
        shell.capacity = { volume: capacity, mass: capacity };
        shell.current = { volume: 0, mass: 0 };
        const resource = makeResource({ form, volumePerQuantity: 1, massPerQuantity: 1 });
        return { storage, resource };
    }

    it('an unsized single product may use the whole shell it is stored in', () => {
        const { storage, resource } = withShellCapacity('solid', 100);
        const available = getAvailableStorageCapacity(storage, resource);
        expect(available).toBeCloseTo(100);
    });

    it('getAvailableStorageCapacity reports the product compartment free room', () => {
        const { storage, resource } = withShellCapacity('solid', 100);
        storage.shells.solid.compartments[resource.name] = { share: 0.5 };
        storage.currentInStorage[resource.name] = { resource, quantity: 10 };
        storage.shells.solid.current = { volume: 10, mass: 10 };

        // Compartment = half of 100 = 50; 10 used leaves 40 for this product.
        const available = getAvailableStorageCapacity(storage, resource);
        expect(available).toBeCloseTo(40);
    });

    it('form-limited shell creates a hard cap independent of other forms', () => {
        const { storage, resource } = withShellCapacity('solid', 100);
        const liquid = makeResource({ form: 'liquid', volumePerQuantity: 1, massPerQuantity: 1 });

        storage.shells.solid.compartments[resource.name] = { share: 1 };
        putIntoStorageFacility(storage, resource, 100);
        storage.shells.liquid.compartments[liquid.name] = { share: 1 };
        expect(putIntoStorageFacility(storage, liquid, 40)).toBeCloseTo(40);
        expect(putIntoStorageFacility(storage, resource, 10)).toBeCloseTo(0);
        expect(storage.shells.solid.current.volume).toBeCloseTo(100);
    });

    it('degrades inflow once a compartment approaches its own capacity, unaffected by the sibling', () => {
        const { storage, resource } = withShellCapacity('solid', 100);
        const sameForm = makeResource({ name: 'sibling', form: 'solid' });
        storage.shells.solid.compartments[resource.name] = { share: 0.5 };
        storage.shells.solid.compartments[sameForm.name] = { share: 0.5 };

        putIntoStorageFacility(storage, resource, 50);
        expect(storage.shells.solid.current.volume).toBeCloseTo(50);
        expect(putIntoStorageFacility(storage, sameForm, 50)).toBeCloseTo(50);
        expect(putIntoStorageFacility(storage, resource, 40)).toBeCloseTo(0);
        expect(storage.shells.solid.current.volume).toBeCloseTo(100);
    });

    it('remove decrements the owning shell current', () => {
        const { storage, resource } = withShellCapacity('liquid', 1000);
        storage.shells.liquid.compartments[resource.name] = { share: 1 };
        putIntoStorageFacility(storage, resource, 300);
        const removed = removeFromStorageFacility(storage, resource.name, 120);

        expect(removed).toBeCloseTo(120);
        expect(storage.shells.liquid.current.volume).toBeCloseTo(180);
        expect(storage.shells.liquid.current.mass).toBeCloseTo(180);
    });
});
