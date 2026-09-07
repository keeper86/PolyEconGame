import { describe, expect, it } from 'vitest';
import { makeAgentPlanetAssets, makeProductionFacility, makeStorageFacility } from '../../utils/testHelper';
import type { Resource } from '../claims';
import type { Storage } from '../facility';
import { STORAGE_SHELL_CAPACITY, getStorageCapacityState } from '../facility';
import {
    updateAgentShellCompartments,
    allocateShellCells,
    resolveFormShell,
    type StorageResidency,
} from './shellCompartments';

const V0 = STORAGE_SHELL_CAPACITY.volume; // one scale of volume
const M0 = STORAGE_SHELL_CAPACITY.mass; // one scale of mass

const solidStorage = (): { storage: Storage; shell: Storage['shells']['solid'] } => {
    const storage = makeStorageFacility() as Storage;
    const shell = storage.shells.solid;
    shell.scale = 1;
    shell.maxScale = 1;
    return { storage, shell };
};

// A physical good carrying (volShare*V0, massShare*M0) of footprint per one opened shell scale.
const byCapacityShare = (
    name: string,
    volShare: number,
    massShare: number,
    volumePerQuantity = 1,
    massPerQuantity = 1,
): StorageResidency => ({
    name,
    resource: {
        name,
        form: 'solid',
        level: 'raw',
        volumePerQuantity,
        massPerQuantity,
    } as unknown as Resource,
    targetQuantity: Math.max((volShare * V0) / volumePerQuantity, (massShare * M0) / massPerQuantity),
    volume: volShare * V0,
    mass: massShare * M0,
});

const sumShares = (shares: Record<string, number>): number => Object.values(shares).reduce((a, b) => a + b, 0);

describe('allocateShellCells against realistic per-scale capacity', () => {
    it('splits one scale cleanly between a bulky-volume good and a dense-mass good', () => {
        const footprint: StorageResidency[] = [byCapacityShare('bulk', 0.6, 0.05), byCapacityShare('dense', 0.02, 0.3)];
        const { storage, shell } = solidStorage();
        const allocation = allocateShellCells(shell, footprint, 1);
        expect(allocation.feasible).toBe(true);
        expect(allocation.shares.bulk).toBeCloseTo(0.6);
        expect(allocation.shares.dense).toBeCloseTo(0.3);
        expect(sumShares(allocation.shares)).toBeLessThanOrEqual(1 + 1e-9);
        void storage;
    });

    it('marks the footprint infeasible when the combined footprint needs more than one scale', () => {
        const footprint: StorageResidency[] = [byCapacityShare('bulk', 0.9, 0.1), byCapacityShare('dense', 0.1, 0.9)];
        const { shell } = solidStorage();
        const allocation = allocateShellCells(shell, footprint, 1);
        expect(allocation.feasible).toBe(false);
        // Infeasible water-fills: both go growable and split the whole scale in half.
        expect(allocation.shares.bulk).toBeCloseTo(0.5);
        expect(allocation.shares.dense).toBeCloseTo(0.5);
    });

    it('keeps a cell above what is physically already stacked in it', () => {
        const footprint: StorageResidency[] = [byCapacityShare('ore', 0.2, 0.2)];
        const { shell } = solidStorage();
        // Hold 45% of a full scale by mass so an authored 0.2 share can never strand it.
        shell.currentInStorage.ore = {
            resource: byCapacityShare('ore', 0.1, 0.45).resource,
            quantity: 0.45 * M0,
        };
        const allocation = allocateShellCells(shell, footprint, 1);
        expect(allocation.feasible).toBe(true);
        expect(allocation.shares.ore).toBeGreaterThanOrEqual(0.45 - 1e-9);
    });

    it('hands every growable cell the same leftover when several produced goods are short on space', () => {
        const footprint: StorageResidency[] = [byCapacityShare('a', 0.9, 0.1), byCapacityShare('b', 1.0, 0.5)];
        const { shell } = solidStorage();
        const allocation = allocateShellCells(shell, footprint, 1);
        expect(allocation.feasible).toBe(false);
        const growable = Object.entries(allocation.shares).filter(([, v]) => v < 1 - 1e-9);
        expect(growable.every(([, v]) => v > 0)).toBe(true);
    });
});

describe('resolveFormShell grows a shell to the footprint scale', () => {
    it('is infeasible before growing and feasible at the reported required scale', () => {
        const { storage } = solidStorage();
        const footprint: StorageResidency[] = [byCapacityShare('ore', 2.4, 3.0)];

        const before = resolveFormShell(storage, 'solid', footprint);
        expect(before.feasible).toBe(false);
        expect(before.requiredScale).toBeGreaterThan(1);

        const grownStorage = solidStorage().storage;
        const grownShell = grownStorage.shells.solid;
        grownShell.scale = Math.ceil(before.requiredScale);
        grownShell.maxScale = grownShell.scale;
        const grown = resolveFormShell(grownStorage, 'solid', footprint);
        expect(grown.feasible).toBe(true);
        const state = getStorageCapacityState(grownStorage, footprint[0].resource);
        expect(state.capacity.volume).toBeGreaterThanOrEqual(footprint[0].volume - 1e-6);
        expect(state.capacity.mass).toBeGreaterThanOrEqual(footprint[0].mass - 1e-6);
    });

    it('reports one shared footprint scale that fits a numerically skewed pair', () => {
        // metal volume-heavy, fabric mass-heavy: each binds on a different axis.
        const resident: StorageResidency[] = [
            byCapacityShare('metal', 0.45, 0.05),
            byCapacityShare('fabric', 0.05, 0.4),
        ];
        const { storage } = solidStorage();
        const planned = resolveFormShell(storage, 'solid', resident);
        expect(planned.requiredScale).toBeLessThanOrEqual(1 + 1e-9);
        expect(planned.feasible).toBe(true);
    });
});

describe('updateAgentShellCompartments sizing', () => {
    it('returns an empty map when the agent produces nothing physical', () => {
        const storage = makeStorageFacility() as Storage;
        const sizing = updateAgentShellCompartments(makeAgentPlanetAssets('p', { productionFacilities: [], storage }));
        expect(Object.keys(sizing)).toHaveLength(0);
    });

    it('reports an infeasible solid allocation when a single facility out-ships one shell-scale', () => {
        const storage = makeStorageFacility() as Storage;
        const resource = makeProdResource('ore', 'solid', 1, 1);
        const maxScale = Math.max(1, Math.ceil((8 * V0) / (4 * 30)));
        const facility = makeProductionFacility(undefined, {
            produces: [{ resource, quantity: 1 }],
            maxScale,
            scale: maxScale,
        });
        const sizing = updateAgentShellCompartments(
            makeAgentPlanetAssets('p', { productionFacilities: [facility], storage }),
        );
        expect(sizing.solid).toBeDefined();
        expect(sizing.solid!.requiredScale).toBeGreaterThan(1);
    });

    it('pre-grants the required shell scale so a world-scale overcapacity becomes feasible immediately', () => {
        // Iron ore output at 4 production-scales per tick for the whole capacity window needs more than
        // one storage shell-scale; updateAgentShellCompartments reports that requirement.
        const storage = makeStorageFacility() as Storage;
        const ore = makeProdResource('Iron Ore', 'solid', 0.3, 1); // matches catalog-ish densities for mass 1/unit
        const maxScale = 4;
        const furnace = makeProductionFacility(undefined, {
            produces: [{ resource: ore, quantity: 6_000_000 }],
            scale: maxScale,
            maxScale,
        });

        const sizing = updateAgentShellCompartments(
            makeAgentPlanetAssets('p', { productionFacilities: [furnace], storage }),
        );
        expect(sizing.solid!.requiredScale).toBeGreaterThan(1);

        // Emulate the world presizer: install the reported scale onto the shell (ceil stays integer).
        const solid = storage.shells.solid;
        solid.scale = Math.ceil(sizing.solid!.requiredScale);
        solid.maxScale = solid.scale;
        solid.compartments = {};

        const grown = updateAgentShellCompartments(
            makeAgentPlanetAssets('p', { productionFacilities: [furnace], storage }),
        );
        expect(grown.solid!.feasible).toBe(true);
    });
});

function makeProdResource(name: string, form: 'solid' | 'liquid' | 'pieces', vol: number, mass: number): Resource {
    return { name, form, level: 'raw', volumePerQuantity: vol, massPerQuantity: mass } as unknown as Resource;
}
