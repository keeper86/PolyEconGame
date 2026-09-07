import { describe, expect, it } from 'vitest';

import { makeStorageFacility } from '../../utils/testHelper';
import type { Resource } from '../claims';
import type { Storage } from '../facility';
import { getStorageCapacityState } from '../facility';
import { allocateShellCells, resolveFormShell, type StorageResidency } from './shellCompartments';

const makeResource = (name: string, volumePerQuantity: number, massPerQuantity: number): Resource =>
    ({
        name,
        form: 'solid' as const,
        level: 'raw' as const,
        volumePerQuantity,
        massPerQuantity,
    }) as unknown as Resource;

const makeResidency = (
    name: string,
    targetQuantity: number,
    volumePerQuantity: number,
    massPerQuantity: number,
): StorageResidency => {
    const resource = makeResource(name, volumePerQuantity, massPerQuantity);
    return {
        name,
        resource,
        targetQuantity,
        volume: targetQuantity * volumePerQuantity,
        mass: targetQuantity * massPerQuantity,
    };
};

const residencyOf = (
    name: string,
    volume: number,
    mass: number,
    volumePerQuantity = 1,
    massPerQuantity = 1,
): StorageResidency => ({
    name,
    resource: makeResource(name, volumePerQuantity, massPerQuantity),
    targetQuantity: Math.max(volume / volumePerQuantity, mass / massPerQuantity),
    volume,
    mass,
});

const sumShares = (shares: Record<string, number>): number => Object.values(shares).reduce((a, b) => a + b, 0);

const shellWithCapacity = (
    capVol: number,
    capMass: number,
): { storage: Storage; shell: Storage['shells']['solid'] } => {
    const storage = makeStorageFacility({}, { volume: capVol, mass: capMass }) as Storage;
    const shell = storage.shells.solid;
    shell.scale = 1;
    shell.maxScale = 1;
    return { storage, shell };
};

describe('allocateShellCells', () => {
    it('grants each feasible resource exactly its binding share', () => {
        // volCap 100, massCap 200 per scale. Two goods split it cleanly.
        const footprint = [
            residencyOf('ore', 40, 100), // volShare 0.4, massShare 0.5 -> binding 0.5
            residencyOf('scrap', 30, 60), // volShare 0.3, massShare 0.3
        ];
        const { shell } = shellWithCapacity(100, 200);
        const allocation = allocateShellCells(shell, footprint, 1);
        expect(allocation.feasible).toBe(true);
        expect(allocation.shares.ore).toBeCloseTo(0.5);
        expect(allocation.shares.scrap).toBeCloseTo(0.3);
        expect(sumShares(allocation.shares)).toBeLessThanOrEqual(1);
    });

    it('marks a dense/bulky sum infeasible when total footprint exceeds the shell', () => {
        const footprint = [
            residencyOf('metal', 40, 40000), // massShare 40000/80000=0.5
            residencyOf('ore', 45, 1), // volShare 45/100=0.45
            residencyOf('scrap', 40, 40000), // massShare 0.5
        ];
        const { shell } = shellWithCapacity(100, 80000);
        const allocation = allocateShellCells(shell, footprint, 1);
        expect(allocation.feasible).toBe(false);
    });

    it('confiscation waterfills the free space equally across growable cells', () => {
        const footprint = [residencyOf('a', 40, 40), residencyOf('b', 160, 160)];
        const { shell } = shellWithCapacity(100, 100);
        shell.currentInStorage.a = { resource: footprint[0].resource, quantity: 40 };
        shell.currentInStorage.b = { resource: footprint[1].resource, quantity: 10 };
        const allocation = allocateShellCells(shell, footprint, 1);
        expect(allocation.feasible).toBe(false);
        // Both growable: lock the occupied floor and split the free half evenly.
        expect(allocation.shares.a).toBeCloseTo(0.4 + 0.25);
        expect(allocation.shares.b).toBeCloseTo(0.1 + 0.25);
        expect(sumShares(allocation.shares)).toBeLessThanOrEqual(1 + 1e-9);
    });

    it('keeps a physically full cell locked and hands all free space to the growable cells', () => {
        const footprint = [residencyOf('fullA', 200, 200), residencyOf('emptyB', 200, 200)];
        const { shell } = shellWithCapacity(100, 100);
        shell.currentInStorage.fullA = { resource: footprint[0].resource, quantity: 95 }; // nearly full cell
        const allocation = allocateShellCells(shell, footprint, 1);
        expect(allocation.feasible).toBe(false);
        // The occupied floor (0.95) is preserved; the free remainder goes to the empty cell.
        expect(allocation.shares.fullA).toBeGreaterThanOrEqual(0.95 - 1e-9);
        expect(allocation.shares.emptyB).toBeGreaterThanOrEqual(0.02 - 1e-9);
        expect(sumShares(allocation.shares)).toBeLessThanOrEqual(1 + 1e-9);
    });

    it('never lets an authored share drop a currently-held resource below its used occupancy', () => {
        const footprint = [residencyOf('ore', 50, 50)];
        const { shell } = shellWithCapacity(100, 100);
        shell.currentInStorage.ore = { resource: footprint[0].resource, quantity: 80 };
        const allocation = allocateShellCells(shell, footprint, 1);
        expect(allocation.feasible).toBe(true);
        expect(allocation.shares.ore).toBeCloseTo(0.8);
    });
});

describe('resolveFormShell integration with live capacity', () => {
    it('authors target-capacity compartments that reach every produced target at the required scale', () => {
        const capVol = 1000;
        const capMass = 1000;
        const { storage, shell } = shellWithCapacity(capVol, capMass);

        const footprint: StorageResidency[] = [makeResidency('ore', 400, 1, 1), makeResidency('scrap', 200, 1, 1)];
        const allocation = resolveFormShell(storage, 'solid', footprint);
        expect(allocation.requiredScale).toBeCloseTo(1);
        expect(allocation.feasible).toBe(true);
        shell.compartments.ore = allocation.shares.ore;
        shell.compartments.scrap = allocation.shares.scrap;
        for (const f of footprint) {
            const state = getStorageCapacityState(storage, f.resource);
            expect(state.capacity.volume).toBeGreaterThanOrEqual(f.volume - 1e-6);
            expect(state.capacity.mass).toBeGreaterThanOrEqual(f.mass - 1e-6);
        }
    });

    it('grows the shell scale to reach the required scale and then satisfies targets', () => {
        const capVol = 100;
        const capMass = 100;
        const { storage, shell } = shellWithCapacity(capVol, capMass);

        // Needs 3 scales worth of one bulky resource at per-scale capacity 100.
        const footprint: StorageResidency[] = [makeResidency('bulk', 250, 1, 1)];
        const first = resolveFormShell(storage, 'solid', footprint);
        expect(first.requiredScale).toBeGreaterThan(2);

        // Not yet grown: authoring at scale 1 cannot satisfy the 250 target.
        const before = getStorageCapacityState(storage, footprint[0].resource);
        expect(before.capacity.volume).toBeLessThan(250 - 1e-6);

        // Simulate the construction tick having grown the shell to the required scale.
        shell.scale = Math.ceil(first.requiredScale);
        shell.maxScale = shell.scale;
        shell.compartments = {};
        const grown = resolveFormShell(storage, 'solid', footprint);
        expect(grown.feasible).toBe(true);
        shell.compartments.bulk = grown.shares.bulk;
        const after = getStorageCapacityState(storage, footprint[0].resource);
        expect(after.capacity.volume).toBeGreaterThanOrEqual(250 - 1e-6);
        expect(after.capacity.mass).toBeGreaterThanOrEqual(250 - 1e-6);
    });

    it('reports a per-unit scale that spatially fits every skewed target', () => {
        const capVol = 10000;
        const capMass = 10000;
        const { shell } = shellWithCapacity(capVol, capMass);

        const resident = [makeResidency('metal', 50, 1, 100), makeResidency('fabric', 50, 100, 1)];

        // The scale that hosts both targets also lets their authored cells reach each footprint.
        const planned = allocateShellCells(shell, resident, 1);
        expect(planned.requiredScale).toBeCloseTo(
            Math.max(1, Math.max(50 / 10000, 5000 / 10000) + Math.max(5000 / 10000, 50 / 10000)),
        );

        // At that required scale, growing the shell and re-authoring lets each resource reach its own
        // footprint on both axes.
        const storage = makeStorageFacility({}, { volume: capVol, mass: capMass }) as Storage;
        const grownShell = storage.shells.solid;
        grownShell.scale = Math.ceil(planned.requiredScale);
        grownShell.maxScale = grownShell.scale;
        const grown = resolveFormShell(storage, 'solid', resident);
        expect(grown.feasible).toBe(true);
        expect(grown.shares.metal + grown.shares.fabric).toBeLessThanOrEqual(1 + 1e-9);
        for (const r of resident) {
            const state = getStorageCapacityState(storage, r.resource);
            expect(state.capacity.volume).toBeGreaterThanOrEqual(r.volume - 1e-6);
            expect(state.capacity.mass).toBeGreaterThanOrEqual(r.mass - 1e-6);
        }
    });
});
