import { describe, expect, it } from 'vitest';
import {
    makeAgentPlanetAssets,
    makeProductionFacility,
    makeShipConstructionFacility,
    makeStorageFacility,
} from '../../utils/testHelper';
import type { Resource } from '../claims';
import type { Storage } from '../facility';
import { STORAGE_CAPACITY_MONTHS } from './constants';
import { STORAGE_SHELL_CAPACITY, getAvailableStorageCapacity, getStorageCapacityState } from '../facility';
import type { TransportShipType } from '../../ships/ships';
import {
    updateAgentShellCompartments,
    allocateShellCells,
    footprintPerForm,
    resolveFormShell,
    applyStorageSizingForFacilities,
    storageSizingForFacilities,
    scaleToHoldContents,
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

const oreResource = (name: string, volumePerQuantity: number, massPerQuantity: number): Resource =>
    ({
        name,
        form: 'solid',
        level: 'raw',
        volumePerQuantity,
        massPerQuantity,
    }) as unknown as Resource;

const serviceResource = (name: string): Resource =>
    ({
        name,
        form: 'services',
        level: 'services',
        volumePerQuantity: 0,
        massPerQuantity: 0,
    }) as unknown as Resource;

describe('storage sizing for production facilities', () => {
    it('sizes each shell form to STORAGE_CAPACITY_MONTHS of that facility output', () => {
        const facility = makeProductionFacility(undefined, {
            produces: [{ resource: oreResource('Ore', 0.3, 1), quantity: 400 }],
            needs: [],
        });
        facility.scale = 100;
        facility.maxScale = 100;

        const sizing = storageSizingForFacilities([facility]);

        const monthsTicks = STORAGE_CAPACITY_MONTHS * 30;
        const massTarget = 400 * 100 * 1 * monthsTicks;
        const volumeTarget = 400 * 100 * 0.3 * monthsTicks;
        expect(sizing.shells.solid).toBeCloseTo(
            Math.max(volumeTarget / STORAGE_SHELL_CAPACITY.volume, massTarget / STORAGE_SHELL_CAPACITY.mass),
            6,
        );
        expect(sizing.shells.liquid).toBe(1);
        expect(sizing.shells.pieces).toBe(1);
        expect(sizing.department).toBeGreaterThan(1);
    });

    it('keeps every shell at the minimum scale when nothing physical is stored', () => {
        const facility = makeProductionFacility(undefined, {
            produces: [{ resource: serviceResource('Grocery Service'), quantity: 10 }],
            needs: [],
        });
        facility.scale = 50;
        facility.maxScale = 50;

        const sizing = storageSizingForFacilities([facility]);

        expect(sizing.shells).toEqual({ solid: 1, liquid: 1, pieces: 1 });
        expect(sizing.department).toBe(1);
    });

    it('applies the sizing to shells and logistics department', () => {
        const facility = makeProductionFacility(undefined, {
            produces: [{ resource: oreResource('Ore', 0.3, 1), quantity: 400 }],
            needs: [],
        });
        facility.scale = 10;
        facility.maxScale = 10;
        const storage = makeStorageFacility() as Storage;
        storage.department = null;

        applyStorageSizingForFacilities(storage, [facility]);

        const sizing = storageSizingForFacilities([facility]);
        expect(storage.shells.solid.scale).toBeCloseTo(sizing.shells.solid, 6);
        expect(storage.shells.solid.maxScale).toBeCloseTo(sizing.shells.solid, 6);
        expect(storage.shells.liquid.scale).toBe(1);
        expect(storage.shells.pieces.scale).toBe(1);
    });
});

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

    it('splits the required scale proportionally when the footprint needs more than one scale', () => {
        const footprint: StorageResidency[] = [byCapacityShare('bulk', 0.9, 0.1), byCapacityShare('dense', 0.1, 0.9)];
        const { shell } = solidStorage();
        const allocation = allocateShellCells(shell, footprint, 1);
        expect(allocation.feasible).toBe(true);
        expect(allocation.requiredScale).toBeCloseTo(1.8, 6);
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

    it('gives every produced good a positive cell of the required scale', () => {
        const footprint: StorageResidency[] = [byCapacityShare('a', 0.9, 0.1), byCapacityShare('b', 1.0, 0.5)];
        const { shell } = solidStorage();
        const allocation = allocateShellCells(shell, footprint, 1);
        expect(allocation.feasible).toBe(true);
        expect(allocation.requiredScale).toBeCloseTo(1.9, 6);
        const shares = Object.values(allocation.shares);
        expect(shares.every((share) => share > 0)).toBe(true);
        expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 6);
    });
});

describe('resolveFormShell grows a shell to the footprint scale', () => {
    it('reports the required scale at which the footprint fits', () => {
        const { storage } = solidStorage();
        const footprint: StorageResidency[] = [byCapacityShare('ore', 2.4, 3.0)];

        const before = resolveFormShell(storage, 'solid', footprint);
        expect(before.feasible).toBe(true);
        expect(before.requiredScale).toBeCloseTo(3, 6);

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

describe('compartment capacity follows the allocation, not the shell overshoot', () => {
    const stateFor = (
        shellScale: number,
        footprint: StorageResidency[],
    ): ReturnType<typeof getStorageCapacityState> => {
        const { storage, shell } = solidStorage();
        shell.scale = shellScale;
        shell.maxScale = shellScale;
        resolveFormShell(storage, 'solid', footprint);
        return getStorageCapacityState(storage, footprint[0].resource);
    };

    it('sizes a compartment from the footprint even when the shell is oversized', () => {
        const footprint: StorageResidency[] = [byCapacityShare('ore', 0.5, 1.0)];
        const tight = stateFor(1, footprint);
        const oversized = stateFor(4, footprint);
        expect(oversized.capacity.volume).toBeCloseTo(tight.capacity.volume, 6);
        expect(oversized.capacity.mass).toBeCloseTo(tight.capacity.mass, 6);
        expect(oversized.capacity.mass).toBeCloseTo(footprint[0].mass, 6);
    });

    it('still squeezes a compartment to the installed scale when the shell is undersized', () => {
        const footprint: StorageResidency[] = [byCapacityShare('ore', 2.5, 1.0)];
        const squeezed = stateFor(1, footprint);
        expect(squeezed.capacity.volume).toBeCloseTo(V0, 6);
        expect(squeezed.capacity.mass).toBeCloseTo(M0, 6);
    });

    it('leaves no free space once the stock reaches the allocated compartment', () => {
        const footprint: StorageResidency[] = [byCapacityShare('ore', 0.5, 1.0)];
        const { storage, shell } = solidStorage();
        shell.scale = 4;
        shell.maxScale = 4;
        resolveFormShell(storage, 'solid', footprint);
        shell.currentInStorage.ore = { resource: footprint[0].resource, quantity: M0 };
        expect(getAvailableStorageCapacity(storage, footprint[0].resource)).toBe(0);
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

    it('reserves physical room for each production input alongside its output', () => {
        // A facility that turns ore into metal stores BOTH while it runs (a seed prefill of inputs and a
        // standing output buffer). The shell footprint must reserve months of each, not just the output.
        const storage = makeStorageFacility() as Storage;
        const ore = makeProdResource('ore', 'solid', 1, 0.1);
        const metal = makeProdResource('metal', 'solid', 0.1, 1);
        const scale = 3;
        const facility = makeProductionFacility(undefined, {
            needs: [{ resource: ore, quantity: 60 }],
            produces: [{ resource: metal, quantity: 20 }],
            scale,
            maxScale: scale,
        });

        const footprint = footprintPerForm(makeAgentPlanetAssets('p', { productionFacilities: [facility], storage }));

        const solid = footprint.solid ?? [];
        const byName: Record<string, number> = {};
        for (const residency of solid) {
            byName[residency.name] = residency.targetQuantity;
        }
        expect(Object.keys(byName).sort()).toEqual(['metal', 'ore']);
        const residencyTicks = STORAGE_CAPACITY_MONTHS * 30;
        expect(byName.ore).toBeCloseTo(residencyTicks * 60 * scale);
        expect(byName.metal).toBeCloseTo(residencyTicks * 20 * scale);
    });

    it('reserves ship-building materials even though a ship itself has no stored footprint', () => {
        const storage = makeStorageFacility() as Storage;
        const steel = makeProdResource('steel', 'solid', 0.2, 1);
        const ship: TransportShipType = {
            type: 'transport',
            name: 'Test Ship',
            scale: 'small',
            speed: 1,
            cargoSpecification: { type: 'solid', volume: 1000, mass: 1000 },
            requiredCrew: { none: 0, primary: 0, secondary: 1, tertiary: 0 },
            buildingCost: [{ resource: steel, quantity: 1200 }],
            buildingTime: 120,
        };
        const yard = makeShipConstructionFacility(undefined, { shipType: ship });

        const footprint = footprintPerForm(makeAgentPlanetAssets('p', { shipConstructionFacilities: [yard], storage }));
        const solid = footprint.solid ?? [];
        const steelResidency = solid.find((r) => r.name === 'steel');
        expect(steelResidency).toBeDefined();
        expect(steelResidency!.targetQuantity).toBeCloseTo(STORAGE_CAPACITY_MONTHS * 30 * 10);
    });
});

function makeProdResource(name: string, form: 'solid' | 'liquid' | 'pieces', vol: number, mass: number): Resource {
    return { name, form, level: 'raw', volumePerQuantity: vol, massPerQuantity: mass } as unknown as Resource;
}

describe('shell stock floor', () => {
    const stockShell = (
        scalesHeld: number,
    ): { storage: Storage; shell: Storage['shells']['solid']; resource: Resource } => {
        const { storage, shell } = solidStorage();
        const resource = makeProdResource('Ore', 'solid', 1, 1);
        shell.compartments[resource.name] = 1;
        shell.currentInStorage[resource.name] = { resource, quantity: scalesHeld * M0 };
        return { storage, shell, resource };
    };

    it('sizes the shell to hold its contents instead of shrinking below them', () => {
        const { storage, shell, resource } = stockShell(1.5);

        applyStorageSizingForFacilities(storage, []);

        expect(scaleToHoldContents(storage).solid).toBeGreaterThanOrEqual(2);
        expect(shell.maxScale).toBeGreaterThanOrEqual(2);
        expect(getStorageCapacityState(storage, resource).freeQuantity).toBeGreaterThan(0);
    });
});
