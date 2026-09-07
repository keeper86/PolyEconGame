import { describe, expect, it } from 'vitest';

import type { Resource } from '../claims';
import { getStorageCapacityState } from '../facility';
import type { Storage } from '../facility';
import { makeStorageFacility } from '../../utils/testHelper';
import { resolveShellCells, type CompartmentNeed } from './compartmentAllocator';
import { resolveFormShell, type StorageResidency } from './shellAutoscale';

const makeResource = (name: string, volumePerQuantity: number, massPerQuantity: number): Resource =>
    ({
        name,
        form: 'solid' as const,
        level: 'raw' as const,
        volumePerQuantity,
        massPerQuantity,
    }) as unknown as Resource;

const makeNeed = (
    name: string,
    volumePerQuantity: number,
    massPerQuantity: number,
    targetVolume: number,
    targetMass: number,
): CompartmentNeed => ({
    name,
    resource: makeResource(name, volumePerQuantity, massPerQuantity),
    targetVolume,
    targetMass,
    usedVolume: 0,
    usedMass: 0,
});

const sumShares = (shares: Record<string, number>): number => Object.values(shares).reduce((a, b) => a + b, 0);

describe('resolveShellCells', () => {
    it('grants each feasible resource exactly its binding share', () => {
        // volCap 100, massCap 200 per scale. Two goods split it cleanly.
        const needs = [
            makeNeed('ore', 2, 1, 40, 100), // volShare 0.4, massShare 0.5 -> binding 0.5
            makeNeed('scrap', 1, 2, 30, 60), // volShare 0.3, massShare 0.3
        ];
        const res = resolveShellCells(needs, 100, 200, 1);
        expect(res.feasible).toBe(true);
        expect(res.shares.ore).toBeCloseTo(0.5);
        expect(res.shares.scrap).toBeCloseTo(0.3);
        expect(sumShares(res.shares)).toBeLessThanOrEqual(1);
    });

    it('marks a dense/bulky sum infeasible when total footprint exceeds the shell', () => {
        const needs = [
            makeNeed('metal', 1, 100, 40, 40000), // massShare 40000/80000=0.5
            makeNeed('ore', 2, 1, 45, 1), // volShare 45/100=0.45
            makeNeed('scrap', 1, 1, 40, 40000), // massShare 0.5
        ];
        // mass 0.5*? cap mass 100000 to world; pick cap making sum overflow
        const res = resolveShellCells(needs, 100, 100000, 1);
        expect(res.feasible).toBe(false);
    });

    it('confiscation waterfills the free space equally across growable cells', () => {
        // Physically consistent state: a holds 40/100, b holds 10/100 => used total 0.5 shell.
        const needs = [
            makeNeed('a', 1, 1, 40, 40), // usable target, holds 40 -> satisfied
            makeNeed('b', 1, 1, 160, 160), // oversized target -> infeasible, confiscate
        ] as CompartmentNeed[];
        needs[0].usedVolume = 40;
        needs[0].usedMass = 40;
        needs[1].usedVolume = 10;
        needs[1].usedMass = 10;

        const res = resolveShellCells(needs, 100, 100, 1);
        expect(res.feasible).toBe(false);
        // Both are growable, so both lock their occupied floor and split the free half evenly.
        expect(res.shares.a).toBeCloseTo(0.4 + 0.25);
        expect(res.shares.b).toBeCloseTo(0.1 + 0.25);
        expect(sumShares(res.shares)).toBeLessThanOrEqual(1 + 1e-9);
    });

    it('keeps a physically full cell locked and hands all free space to the growable cells', () => {
        const needs = [
            makeNeed('fullA', 1, 1, 200, 200), // target oversized
            makeNeed('emptyB', 1, 1, 200, 200), // target oversized too
        ] as CompartmentNeed[];
        needs[0].usedVolume = 95;
        needs[0].usedMass = 95; // nearly full cell
        needs[1].usedVolume = 0;
        needs[1].usedMass = 0;

        const res = resolveShellCells(needs, 100, 100, 1);
        expect(res.feasible).toBe(false);
        // fullA's occupant floor (0.95) is preserved; the free remainder is shared with emptyB.
        expect(res.shares.fullA).toBeGreaterThanOrEqual(0.95 - 1e-9);
        expect(res.shares.emptyB).toBeGreaterThanOrEqual(0.02 - 1e-9);
        expect(sumShares(res.shares)).toBeLessThanOrEqual(1 + 1e-9);
    });

    it('never lets an authored share drop a currently-held resource below its used occupancy', () => {
        const needs = [makeNeed('ore', 1, 1, 50, 50)] as CompartmentNeed[];
        needs[0].usedVolume = 80;
        needs[0].usedMass = 80;
        // declared 0.5 but used floor 0.8 must win.
        const res = resolveShellCells(needs, 100, 100, 1);
        expect(res.feasible).toBe(true);
        expect(res.shares.ore).toBeCloseTo(0.8);
    });
});

describe('resolveFormShell integration with live capacity', () => {
    it('authors target-capacity compartments that reach every produced target at the required scale', () => {
        const capVol = 1000;
        const capMass = 1000;
        const storage = makeStorageFacility({}, { volume: capVol, mass: capMass }) as Storage;
        const shell = storage.shells.solid;
        shell.scale = 1;
        shell.maxScale = 1;

        const footprint: StorageResidency[] = [
            { name: 'ore', resource: makeResource('ore', 1, 1), targetQuantity: 400, volume: 400, mass: 400 },
            { name: 'scrap', resource: makeResource('scrap', 1, 1), targetQuantity: 200, volume: 200, mass: 200 },
        ];
        const { resolution, requiredScale } = resolveFormShell(storage, 'solid', footprint);
        expect(requiredScale).toBeCloseTo(1);
        expect(resolution.feasible).toBe(true);
        // Authoring must land so that getStorageCapacityState grants each its target.
        shell.compartments.ore = resolution.shares.ore;
        shell.compartments.scrap = resolution.shares.scrap;
        for (const f of footprint) {
            const state = getStorageCapacityState(storage, f.resource);
            expect(state.capacity.volume).toBeGreaterThanOrEqual(f.volume - 1e-6);
            expect(state.capacity.mass).toBeGreaterThanOrEqual(f.mass - 1e-6);
        }
    });

    it('grows the shell scale to reach the required scale and then satisfies targets', () => {
        const capVol = 100;
        const capMass = 100;
        const storage = makeStorageFacility({}, { volume: capVol, mass: capMass }) as Storage;
        const shell = storage.shells.solid;
        shell.scale = 1;
        shell.maxScale = 1;

        // Needs 3 scales worth of one bulky resource at per-scale capacity 100.
        const footprint: StorageResidency[] = [
            { name: 'bulk', resource: makeResource('bulk', 1, 1), targetQuantity: 250, volume: 250, mass: 250 },
        ];
        const first = resolveFormShell(storage, 'solid', footprint);
        expect(first.requiredScale).toBeGreaterThan(2);

        // Not yet grown: authoring at scale 1 cannot satisfy the 250 target.
        const state1 = getStorageCapacityState(storage, footprint[0].resource);
        expect(state1.capacity.volume).toBeLessThan(250 - 1e-6);

        // Simulate the construction tick having grown the shell to the required scale.
        shell.scale = Math.ceil(first.requiredScale);
        shell.maxScale = shell.scale;
        shell.compartments = {};
        const grown = resolveFormShell(storage, 'solid', footprint);
        expect(grown.resolution.feasible).toBe(true);
        shell.compartments.bulk = grown.resolution.shares.bulk;
        const state2 = getStorageCapacityState(storage, footprint[0].resource);
        expect(state2.capacity.volume).toBeGreaterThanOrEqual(250 - 1e-6);
        expect(state2.capacity.mass).toBeGreaterThanOrEqual(250 - 1e-6);
    });
});
