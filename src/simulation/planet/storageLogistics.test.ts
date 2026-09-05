import { describe, expect, it } from 'vitest';
import { makeAgent, makeManagementFacility, makePlanet, makeStorageFacility } from '../utils/testHelper';
import type { Resource } from './claims';
import type { StorageDepartment, Storage } from './facility';
import {
    getStorageStarvation,
    inflowPreservation,
    putIntoStorageFacility,
    storagePreservationFactor,
} from './facility';
import type { AgentPlanetAssets } from './planet';
import { createEmptyDemographicEventCounters } from './planet';
import { logisticsServiceResourceType, storageServiceResourceType } from './services';
import { storageLogisticsTick } from './storageLogistics';

function makeResource(name: string, massPerQty = 1, volumePerQty = 0): Resource {
    return {
        name,
        form: 'solid',
        level: 'raw',
        volumePerQuantity: volumePerQty,
        massPerQuantity: massPerQty,
    } as Resource;
}

function makeAssetsWithStorage(overrides?: {
    storageOverrides?: Partial<Storage>;
    hasCommercialLicense?: boolean;
}): AgentPlanetAssets {
    const storage = makeStorageFacility({
        department: { ...makeManagementFacility(), storageBuffer: 0, storageStarvation: 0 },
        ...overrides?.storageOverrides,
    });
    return {
        productionFacilities: [],
        shipConstructionFacilities: [],
        storageFacility: storage,
        humanResourcesDepartment: null,
        hrProductivityMultiplier: 1,
        transportContracts: [],
        constructionContracts: [],
        shipBuyingOffers: [],
        shipListings: [],
        deposits: 0,
        depositHold: 0,
        activeLoans: [],
        allocatedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
        totalSlotCapacity: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
        unusedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
        usedWorkers: 0,
        overqualifiedWorkers: {},
        market: { sell: {}, buy: {} },
        wagePerEdu: { none: 1, primary: 1, secondary: 1, tertiary: 1 },
        workforceDemography: [],
        deaths: createEmptyDemographicEventCounters(),
        disabilities: createEmptyDemographicEventCounters(),
        profitShareBonus: 0,
        lastDepreciatedPerTick: {},
        monthAcc: {
            depositsAtMonthStart: 0,
            productionValue: 0,
            consumptionValue: 0,
            wages: 0,
            revenue: 0,
            purchases: 0,
            claimPayments: 0,
            interestPaid: 0,
            wealthTaxPaid: 0,
            totalWorkersTicks: 0,
            forexRevenue: 0,
            forexPurchases: 0,
            profitShareBonuses: 0,
            producedResources: {},
            consumedResources: {},
            boughtResources: {},
            soldResources: {},
            depreciatedServices: {},
            naturalDepreciationValue: 0,
        },
        lastMonthAcc: {
            productionValue: 0,
            consumptionValue: 0,
            wages: 0,
            revenue: 0,
            purchases: 0,
            claimPayments: 0,
            interestPaid: 0,
            wealthTaxPaid: 0,
            totalWorkersTicks: 0,
            forexRevenue: 0,
            forexPurchases: 0,
            profitShareBonuses: 0,
            producedResources: {},
            consumedResources: {},
            boughtResources: {},
            soldResources: {},
            depreciatedServices: {},
            naturalDepreciationValue: 0,
        },
        licenses: overrides?.hasCommercialLicense !== false ? { commercial: { acquiredTick: 0, frozen: false } } : {},
    };
}

describe('inflowPreservation', () => {
    it('returns 1.0 at SS=0', () => {
        expect(inflowPreservation(0)).toBeCloseTo(1.0);
    });
    it('returns 0.5 at SS=1', () => {
        expect(inflowPreservation(1)).toBeCloseTo(0.5);
    });
});

describe('storagePreservationFactor', () => {
    it('returns 1.0 at SS=0', () => {
        expect(storagePreservationFactor(0)).toBeCloseTo(1.0);
    });
    it('returns 0.95 at SS=1', () => {
        expect(storagePreservationFactor(1)).toBeCloseTo(0.95);
    });
});

describe('getStorageStarvation', () => {
    it('returns 1.0 when department is null', () => {
        const storage = makeStorageFacility({ department: null as unknown as StorageDepartment });
        expect(getStorageStarvation(storage)).toBe(1.0);
    });
    it('returns department SS when present', () => {
        const storage = makeStorageFacility();
        storage.department!.storageStarvation = 0.42;
        expect(getStorageStarvation(storage)).toBe(0.42);
    });
});

describe('putIntoStorageFacility logistics', () => {
    it('returns pre-loss accepted quantity, stores less when SS is high', () => {
        const iron = makeResource('Iron Ore', 1);
        const s0 = makeStorageFacility();
        s0.department!.storageStarvation = 0;
        s0.capacity = { volume: 1e9, mass: 1e9 };
        expect(putIntoStorageFacility(s0, iron, 100)).toBeCloseTo(100);

        const s1 = makeStorageFacility();
        s1.department!.storageStarvation = 1;
        s1.capacity = { volume: 1e9, mass: 1e9 };
        const accepted = putIntoStorageFacility(s1, iron, 100);
        expect(accepted).toBeCloseTo(100);
        expect(s1.currentInStorage['Iron Ore']?.quantity).toBeCloseTo(50, 0);
    });

    it('debits logisticsBuffer by stored mass', () => {
        const iron = makeResource('Iron Ore', 5);
        const storage = makeStorageFacility();
        storage.department!.storageBuffer = 100;
        storage.capacity = { volume: 1e9, mass: 1e9 };
        putIntoStorageFacility(storage, iron, 20);
        expect(storage.department!.storageBuffer).toBeCloseTo(0);
    });
});

describe('storageLogisticsTick', () => {
    it('resets logisticsBuffer to 0', () => {
        const assets = makeAssetsWithStorage();
        assets.storageFacility.department!.storageBuffer = -100;
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        expect(assets.storageFacility.department!.storageBuffer).toBe(0);
    });

    it('relaxes SS when buffer >= 0', () => {
        const assets = makeAssetsWithStorage();
        const dept = assets.storageFacility.department!;
        dept.storageStarvation = 0.5;
        dept.storageBuffer = 0;
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        expect(dept.storageStarvation).toBeLessThan(0.5);
    });

    it('drives SS upward when buffer negative', () => {
        const assets = makeAssetsWithStorage();
        const dept = assets.storageFacility.department!;
        dept.storageStarvation = 0.1;
        dept.storageBuffer = -7000;
        dept.scale = 5;
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        expect(dept.storageStarvation).toBeGreaterThan(0.1);
    });

    it('credits buffer from produced storage service', () => {
        const assets = makeAssetsWithStorage();
        const dept = assets.storageFacility.department!;
        dept.storageBuffer = -100;
        putIntoStorageFacility(assets.storageFacility, storageServiceResourceType, 500);
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        expect(dept.storageBuffer).toBeGreaterThan(-100);
    });

    it('degrades stored physical goods when SS > 0', () => {
        const iron = makeResource('Iron Ore', 1);
        const assets = makeAssetsWithStorage();
        const storage = assets.storageFacility;
        storage.department!.storageStarvation = 1;
        storage.capacity = { volume: 1e9, mass: 1e9 };
        putIntoStorageFacility(storage, iron, 1000);
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        const remaining = storage.currentInStorage['Iron Ore']?.quantity ?? 0;
        expect(remaining).toBeLessThan(1000);
    });

    it('degrades services faster when SS high', () => {
        const assets = makeAssetsWithStorage();
        const storage = assets.storageFacility;
        storage.department!.storageStarvation = 1;
        putIntoStorageFacility(storage, logisticsServiceResourceType, 1000);
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        const remaining = storage.currentInStorage[logisticsServiceResourceType.name]?.quantity ?? 0;
        expect(remaining).toBeLessThan(1000);
    });

    it('normalizes starvation update rate independent of department scale', () => {
        const assets1 = makeAssetsWithStorage();
        const dept1 = assets1.storageFacility.department!;
        dept1.scale = 1;
        dept1.storageStarvation = 0.1;
        dept1.storageBuffer = -2000;

        const assets2 = makeAssetsWithStorage();
        const dept2 = assets2.storageFacility.department!;
        dept2.scale = 100;
        dept2.storageStarvation = 0.1;
        dept2.storageBuffer = -200000;

        const planet = makePlanet();
        const agent1 = makeAgent('a', 'p', 'A', { assets: { p: assets1 } });
        const agent2 = makeAgent('b', 'p', 'B', { assets: { p: assets2 } });

        storageLogisticsTick(
            new Map([
                ['a', agent1],
                ['b', agent2],
            ]),
            planet,
        );

        expect(dept1.storageStarvation).toBeGreaterThan(0.1);
        expect(dept2.storageStarvation).toBeGreaterThan(0.1);
        expect(dept1.storageStarvation).toBeCloseTo(dept2.storageStarvation, 5);
    });

    it('skips agents without commercial license', () => {
        const assets = makeAssetsWithStorage({ hasCommercialLicense: false });
        const dept = assets.storageFacility.department!;
        dept.storageBuffer = -100;
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        expect(dept.storageBuffer).toBe(-100);
    });
});
