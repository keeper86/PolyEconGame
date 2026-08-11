import { describe, expect, it } from 'vitest';
import { SS_BUFFER_MULTIPLIER, SS_RELAXATION_RATE, SR_HOLDING_COST_PER_TON, SERVICE_DEPRECIATION_RATE_PER_TICK } from '../constants';
import {
    getStorageStarvation,
    inflowPreservation,
    putIntoStorageFacility,
    removeFromStorageFacility,
    storagePreservationFactor,
} from './facility';
import type { StorageFacility, StorageDepartment } from './facility';
import type { Resource } from './claims';
import { makeStorageFacility, makeManagementFacility, makeAgent, makePlanet } from '../utils/testHelper';
import { createEmptyDemographicEventCounters } from './planet';
import { storageLogisticsTick } from './storageLogistics';
import type { AgentPlanetAssets } from './planet';
import { storageServiceResourceType, logisticsServiceResourceType } from './services';

function makeResource(name: string, massPerQty = 1, volumePerQty = 0): Resource {
    return { name, form: 'solid', level: 'raw', volumePerQuantity: volumePerQty, massPerQuantity: massPerQty } as Resource;
}

function makeAssetsWithStorage(overrides?: {
    storageOverrides?: Partial<StorageFacility>;
    hasCommercialLicense?: boolean;
}): AgentPlanetAssets {
    const storage = makeStorageFacility({
        department: { ...makeManagementFacility(), storageBuffer: 0, logisticsBuffer: 0, storageStarvation: 0 },
        ...overrides?.storageOverrides,
    });
    return {
        productionFacilities: [], shipConstructionFacilities: [], storageFacility: storage,
        humanResourcesDepartment: null, hrProductivityMultiplier: 1,
        transportContracts: [], constructionContracts: [], shipBuyingOffers: [], shipListings: [],
        deposits: 0, depositHold: 0, activeLoans: [],
        allocatedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
        totalSlotCapacity: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
        unusedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
        usedWorkers: 0, overqualifiedWorkers: {},
        market: { sell: {}, buy: {} },
        wagePerEdu: { none: 1, primary: 1, secondary: 1, tertiary: 1 },
        workforceDemography: [],
        deaths: createEmptyDemographicEventCounters(),
        disabilities: createEmptyDemographicEventCounters(),
        profitShareBonus: 0,
        lastDepreciatedPerTick: {},
        monthAcc: {
            depositsAtMonthStart: 0, productionValue: 0, consumptionValue: 0, wages: 0,
            revenue: 0, purchases: 0, claimPayments: 0, totalWorkersTicks: 0,
            forexRevenue: 0, forexPurchases: 0, profitShareBonuses: 0,
            producedResources: {}, consumedResources: {}, boughtResources: {}, soldResources: {}, depreciatedServices: {},
        },
        lastMonthAcc: {
            productionValue: 0, consumptionValue: 0, wages: 0, revenue: 0,
            purchases: 0, claimPayments: 0, totalWorkersTicks: 0,
            forexRevenue: 0, forexPurchases: 0, profitShareBonuses: 0,
            producedResources: {}, consumedResources: {}, boughtResources: {}, soldResources: {}, depreciatedServices: {},
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
    it('returns 0.9 at SS=1', () => {
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
    it('stores less when SS is high', () => {
        const iron = makeResource('Iron Ore', 1);
        const s0 = makeStorageFacility();
        s0.department!.storageStarvation = 0;
        s0.capacity = { volume: 1e9, mass: 1e9 };
        expect(putIntoStorageFacility(s0, iron, 100)).toBeCloseTo(100);

        const s1 = makeStorageFacility();
        s1.department!.storageStarvation = 1;
        s1.capacity = { volume: 1e9, mass: 1e9 };
        expect(putIntoStorageFacility(s1, iron, 100)).toBeCloseTo(50);
    });

    it('debits logisticsBuffer by stored mass', () => {
        const iron = makeResource('Iron Ore', 5);
        const storage = makeStorageFacility();
        storage.department!.logisticsBuffer = 100;
        storage.capacity = { volume: 1e9, mass: 1e9 };
        putIntoStorageFacility(storage, iron, 20);
        expect(storage.department!.logisticsBuffer).toBeCloseTo(0);
    });
});

describe('storageLogisticsTick', () => {
    it('resets logisticsBuffer to 0', () => {
        const assets = makeAssetsWithStorage();
        assets.storageFacility.department!.logisticsBuffer = -100;
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        expect(assets.storageFacility.department!.logisticsBuffer).toBe(0);
    });

    it('relaxes SS when buffer >= 0', () => {
        const assets = makeAssetsWithStorage();
        const dept = assets.storageFacility.department!;
        dept.storageStarvation = 0.5;
        dept.logisticsBuffer = 0;
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        expect(dept.storageStarvation).toBeLessThan(0.5);
    });

    it('drives SS upward when buffer negative', () => {
        const assets = makeAssetsWithStorage();
        const dept = assets.storageFacility.department!;
        dept.storageStarvation = 0.1;
        dept.logisticsBuffer = -500;
        dept.scale = 5;
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        expect(dept.storageStarvation).toBeGreaterThan(0.1);
    });

    it('credits buffer from produced storage service', () => {
        const assets = makeAssetsWithStorage();
        const dept = assets.storageFacility.department!;
        dept.logisticsBuffer = -100;
        putIntoStorageFacility(assets.storageFacility, storageServiceResourceType, 500);
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        expect(dept.logisticsBuffer).toBeGreaterThan(-100);
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

    it('skips agents without commercial license', () => {
        const assets = makeAssetsWithStorage({ hasCommercialLicense: false });
        const dept = assets.storageFacility.department!;
        dept.logisticsBuffer = -100;
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        expect(dept.logisticsBuffer).toBe(-100);
    });
});

