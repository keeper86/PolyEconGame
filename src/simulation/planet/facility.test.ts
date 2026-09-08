import { beforeEach, describe, expect, it } from 'vitest';

import type { Resource } from './claims';
import {
    getAvailableStorageCapacity,
    getEscrow,
    lockIntoEscrow,
    makeStorageShell,
    putIntoStorageFacility,
    queryStorageFacility,
    removeFromStorageFacility,
    usageOfShell,
} from './facility';
import type { Storage } from './facility';
import { makeStorageFacility, setStorageResourceQuantity } from '../utils/testHelper';
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
        storage.shells = {
            solid: makeStorageShell(storage.planetId, 'silo', 'solid', 0),
            liquid: makeStorageShell(storage.planetId, 'tank', 'liquid'),
            pieces: makeStorageShell(storage.planetId, 'ware', 'pieces'),
        };
        const resource = makeResource();
        storage.shells.solid.compartments[resource.name] = 1;

        const stored = putIntoStorageFacility(storage, resource, 50);

        expect(stored).toBe(0);
        expect(queryStorageFacility(storage, 'test-resource')).toBe(0);
    });

    it('does not store more of a product than its authored compartment allows', () => {
        const resource = makeResource({ name: 'concrete' });
        const cap = 100;
        storage.shells.solid.capacity = { volume: cap, mass: cap };
        storage.shells.solid.compartments[resource.name] = 0.5;
        putIntoStorageFacility(storage, resource, 50);
        expect(queryStorageFacility(storage, resource.name)).toBeCloseTo(50);
        expect(putIntoStorageFacility(storage, resource, 100)).toBeCloseTo(0);
        expect(queryStorageFacility(storage, resource.name)).toBeCloseTo(50);
    });

    it('a full compartment of one product does not crowd another product compartment', () => {
        const solid = makeResource({ name: 'concrete', form: 'solid' });
        const cap = 100;
        storage.shells.solid.capacity = { volume: cap, mass: cap };
        storage.shells.solid.compartments[solid.name] = 0.5;
        putIntoStorageFacility(storage, solid, 50);
        expect(queryStorageFacility(storage, solid.name)).toBeCloseTo(50);

        const other = makeResource({ name: 'other', form: 'solid' });
        storage.shells.solid.compartments[other.name] = 0.5;
        expect(putIntoStorageFacility(storage, other, 50)).toBeCloseTo(50);
        expect(queryStorageFacility(storage, other.name)).toBeCloseTo(50);
    });

    it('caps a put at the remaining room of the product compartment', () => {
        const resource = makeResource({ name: 'concrete' });
        const cap = 100;
        storage.shells.solid.capacity = { volume: cap, mass: cap };
        storage.shells.solid.compartments[resource.name] = 0.5;
        putIntoStorageFacility(storage, resource, 30);
        expect(putIntoStorageFacility(storage, resource, 50)).toBeCloseTo(20);
        expect(queryStorageFacility(storage, resource.name)).toBeCloseTo(50);
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
        const resource = makeResource({ form, volumePerQuantity: 1, massPerQuantity: 1 });
        return { storage, resource };
    }

    it('an un-authored product has no available capacity until explicitly compartmented', () => {
        const { storage, resource } = withShellCapacity('solid', 100);
        const available = getAvailableStorageCapacity(storage, resource);
        expect(available).toBeCloseTo(0);

        storage.shells.solid.compartments[resource.name] = 1;
        expect(getAvailableStorageCapacity(storage, resource)).toBeCloseTo(100);
    });

    it('getAvailableStorageCapacity reports the product compartment free room', () => {
        const { storage, resource } = withShellCapacity('solid', 100);
        storage.shells.solid.compartments[resource.name] = 0.5;
        setStorageResourceQuantity(storage, resource, 10);

        // Compartment = half of 100 = 50; 10 used leaves 40 for this product.
        const available = getAvailableStorageCapacity(storage, resource);
        expect(available).toBeCloseTo(40);
    });

    it('form-limited shell creates a hard cap independent of other forms', () => {
        const { storage, resource } = withShellCapacity('solid', 100);
        const liquid = makeResource({ form: 'liquid', volumePerQuantity: 1, massPerQuantity: 1 });

        storage.shells.solid.compartments[resource.name] = 1;
        putIntoStorageFacility(storage, resource, 100);
        storage.shells.liquid.compartments[liquid.name] = 1;
        expect(putIntoStorageFacility(storage, liquid, 40)).toBeCloseTo(40);
        expect(putIntoStorageFacility(storage, resource, 10)).toBeCloseTo(0);
        expect(usageOfShell(storage.shells.solid).volume).toBeCloseTo(100);
    });

    it('degrades inflow once a compartment approaches its own capacity, unaffected by the sibling', () => {
        const { storage, resource } = withShellCapacity('solid', 100);
        const sameForm = makeResource({ name: 'sibling', form: 'solid' });
        storage.shells.solid.compartments[resource.name] = 0.5;
        storage.shells.solid.compartments[sameForm.name] = 0.5;

        putIntoStorageFacility(storage, resource, 50);
        expect(usageOfShell(storage.shells.solid).volume).toBeCloseTo(50);
        expect(putIntoStorageFacility(storage, sameForm, 50)).toBeCloseTo(50);
        expect(putIntoStorageFacility(storage, resource, 40)).toBeCloseTo(0);
        expect(usageOfShell(storage.shells.solid).volume).toBeCloseTo(100);
    });

    it('remove decrements the owning shell usage', () => {
        const { storage, resource } = withShellCapacity('liquid', 1000);
        storage.shells.liquid.compartments[resource.name] = 1;
        putIntoStorageFacility(storage, resource, 300);
        const removed = removeFromStorageFacility(storage, resource.name, 120);

        expect(removed).toBeCloseTo(120);
        expect(usageOfShell(storage.shells.liquid).volume).toBeCloseTo(180);
        expect(usageOfShell(storage.shells.liquid).mass).toBeCloseTo(180);
    });
});

describe('per-shell resource ledgers', () => {
    it('stores physical resources in the ledger of the matching shell', () => {
        const storage = makeStorageFacility();
        storage.shells.solid.compartments['test-resource'] = 1;

        putIntoStorageFacility(storage, makeResource(), 50);

        expect(storage.shells.solid.currentInStorage['test-resource']?.quantity).toBeCloseTo(50);
        expect(storage.shells.liquid.currentInStorage['test-resource']).toBeUndefined();
        expect(storage.currentInStorage['test-resource']).toBeUndefined();
        expect(queryStorageFacility(storage, 'test-resource')).toBeCloseTo(50);
    });

    it('locks and releases escrow for physical resources on the owning shell ledger', () => {
        const storage = makeStorageFacility();
        storage.shells.solid.compartments['test-resource'] = 1;
        putIntoStorageFacility(storage, makeResource(), 100);

        const locked = lockIntoEscrow(storage, 'test-resource', 40);

        expect(locked).toBeCloseTo(40);
        expect(storage.shells.solid.escrow['test-resource']).toBeCloseTo(40);
        expect(storage.escrow['test-resource']).toBeUndefined();
        expect(getEscrow(storage, 'test-resource')).toBeCloseTo(40);
        // locked quantity is no longer freely available
        expect(queryStorageFacility(storage, 'test-resource')).toBeCloseTo(60);
    });

    it('tracks no-form (volume-less) resources on the Storage-level ledger', () => {
        const storage = makeStorageFacility();
        const service = makeResource({ form: 'services', volumePerQuantity: 0, massPerQuantity: 0 });

        putIntoStorageFacility(storage, service, 25);
        lockIntoEscrow(storage, service.name, 5);

        expect(storage.currentInStorage[service.name]?.quantity).toBeCloseTo(25);
        expect(storage.escrow[service.name]).toBeCloseTo(5);
        expect(storage.shells.solid.currentInStorage[service.name]).toBeUndefined();
        expect(queryStorageFacility(storage, service.name)).toBeCloseTo(20);
    });

    it('removes physical quantities from the shell that holds them', () => {
        const storage = makeStorageFacility();
        storage.shells.solid.compartments['test-resource'] = 1;
        setStorageResourceQuantity(storage, makeResource(), 60);

        const removed = removeFromStorageFacility(storage, 'test-resource', 20);

        expect(removed).toBeCloseTo(20);
        expect(storage.shells.solid.currentInStorage['test-resource']?.quantity).toBeCloseTo(40);
        expect(queryStorageFacility(storage, 'test-resource')).toBeCloseTo(40);
    });
});
