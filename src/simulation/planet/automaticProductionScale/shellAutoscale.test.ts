import { describe, expect, it } from 'vitest';

import type { Resource } from '../claims';
import { getStorageCapacityState } from '../facility';
import type { Storage } from '../facility';
import { planShell, type StorageResidency } from './shellAutoscale';
import { makeStorageFacility } from '../../utils/testHelper';

const makeResidency = (
    name: string,
    targetQuantity: number,
    volumePerQuantity: number,
    massPerQuantity: number,
): StorageResidency => {
    const resource = {
        name,
        form: 'solid' as const,
        level: 'raw' as const,
        volumePerQuantity,
        massPerQuantity,
    } as unknown as Resource;
    return {
        name,
        resource,
        targetQuantity,
        volume: targetQuantity * volumePerQuantity,
        mass: targetQuantity * massPerQuantity,
    };
};

const residencyResource = (r: StorageResidency): Resource => r.resource;

describe('planShell', () => {
    it('returns an empty plan for an empty shell', () => {
        const plan = planShell([], 100, 100);
        expect(plan.requiredScale).toBe(0);
        expect(plan.cellShares).toEqual({});
    });

    it('gives a lone good the whole shell and a scale equal to its binding axis need', () => {
        const residency = [makeResidency('ore', 50, 2, 1)];
        const plan = planShell(residency, 100, 100);
        // Volume 50*2=100 -> volNeed 1; mass 50*1=50 -> massNeed 0.5.
        expect(plan.requiredScale).toBeCloseTo(1);
        expect(plan.cellShares.ore).toBeCloseTo(1);
    });

    it('scales up the shell when a skewed product needs more than its naive share', () => {
        // Dense metal: small volume, big mass. Bulky textile: big volume, light mass.
        const resident = [
            makeResidency('metal', 50, 1, 100), // vol 50, mass 5000
            makeResidency('fabric', 50, 100, 1), // vol 5000, mass 50
        ];
        const baseVolume = 10000;
        const baseMass = 10000;
        const plan = planShell(resident, baseVolume, baseMass);

        // Each good must still be able to hold its own target in the axis that binds for it:
        const metalTarget = resident[0].targetQuantity;
        const metalNeed = Math.max(resident[0].volume / baseVolume, resident[0].mass / baseMass);
        // capacity of metal cell (quantity) under the realized scale >= its target
        expect(metalNeed * baseVolume / plan.requiredScale > 0).toBe(true);

        for (const g of resident) {
            const qtyByVolume = (plan.cellShares[g.name] * baseVolume * plan.requiredScale) / g.resource.volumePerQuantity;
            const qtyByMass = (plan.cellShares[g.name] * baseMass * plan.requiredScale) / g.resource.massPerQuantity;
            expect(Math.min(qtyByVolume, qtyByMass)).toBeGreaterThanOrEqual(g.targetQuantity - 1e-9);
        }

        // The shares tile the shell exactly (no leftover, no overalloc).
        expect(plan.cellShares.metal + plan.cellShares.fabric).toBeCloseTo(1);
    });

    it('compartments never exceed the shell and cover it fully when the shell is (about to be) boundary', () => {
        const resident = [
            makeResidency('a', 40, 2, 1),
            makeResidency('b', 30, 1, 2),
            makeResidency('c', 10, 5, 5),
        ];
        const plan = planShell(resident, 1000, 1000);
        const sum = Object.values(plan.cellShares).reduce((a, b) => a + b, 0);
        // A single (not yet full) scale unit holds these comfortably; shares never exceed the shell.
        expect(sum).toBeLessThanOrEqual(1);
        expect(plan.requiredScale).toBe(1);
    });

    it('splits a boundary-load shell to exactly full when the footprint demands all of it', () => {
        const resident = [
            makeResidency('a', 500, 1, 1),
            makeResidency('b', 500, 1, 1),
        ];
        const plan = planShell(resident, 1000, 1000);
        // Each needs volume 500, so both fill one scale exactly: shares sum to 1 on scale 1.
        const sum = Object.values(plan.cellShares).reduce((a, b) => a + b, 0);
        expect(plan.requiredScale).toBeCloseTo(1);
        expect(sum).toBeCloseTo(1);
    });
});

describe('planShell x storage clamp integration', () => {
    it('lets each produced good actually reach its own declared target at the planned scale', () => {
        const capVol = 1e9;
        const capMass = 1e9;
        const resident = [
            makeResidency('metal', 5000, 1, 200), // dense good
            makeResidency('fabric', 200000, 20, 0.05), // bulky light good
        ];
        const plan = planShell(resident, capVol, capMass);
        const scale = Math.ceil(plan.requiredScale);

        const storage = makeStorageFacility({}, { volume: capVol, mass: capMass }) as Storage;
        const shell = storage.shells.solid;
        shell.scale = scale;
        shell.maxScale = scale;
        for (const r of resident) {
            shell.compartments[r.name] = plan.cellShares[r.name];
        }

        for (const r of resident) {
            const state = getStorageCapacityState(storage, residencyResource(r));
            // Empty compartment: its total cell capacity (used = 0) must hold the whole target.
            expect(state.capacity.volume).toBeGreaterThanOrEqual(r.volume - 1e-6);
            expect(state.capacity.mass).toBeGreaterThanOrEqual(r.mass - 1e-6);
        }
    });

    it('under-provisions (as expected) when the shell has not yet been grown to the required scale', () => {
        const capVol = 1e9;
        const capMass = 1e9;
        const resident = [makeResidency('bulk', 6000, 400000, 1)]; // needs 3x the per-scale volume
        const plan = planShell(resident, capVol, capMass);
        expect(plan.requiredScale).toBeGreaterThan(1);

        const storage = makeStorageFacility({}, { volume: capVol, mass: capMass }) as Storage;
        const shell = storage.shells.solid;
        // Still at the initial single unit; growth to requiredScale has not completed.
        shell.scale = 1;
        shell.maxScale = 1;
        shell.compartments['bulk'] = plan.cellShares.bulk;

        const state = getStorageCapacityState(storage, residencyResource(resident[0]));
        expect(state.capacity.volume).toBeLessThan(resident[0].volume - 1e-6);
    });
});

