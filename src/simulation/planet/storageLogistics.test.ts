import { describe, expect, it } from 'vitest';
import { makeAgent, makePlanet, makeStorageFacility } from '../utils/testHelper';
import type { Resource } from './claims';
import type { StorageDepartment } from './facility';
import {
    getFormStorageStarvation,
    getTransportStarvation,
    inflowPreservation,
    putIntoStorageFacility,
    queryStorageFacility,
    storageFormKeys,
    storagePreservationFactor,
} from './facility';
import type { AgentPlanetAssets } from './planet';
import { createEmptyDemographicEventCounters } from './planet';
import { internalLogisticsServiceResourceType, logisticsServiceResourceType } from './services';
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
function makeAssets(): AgentPlanetAssets {
    const storage = makeStorageFacility();
    return {
        productionFacilities: [],
        shipConstructionFacilities: [],
        storage,
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
        licenses: {
            commercial: { acquiredTick: 0, frozen: false },
            workforce: { acquiredTick: 0, frozen: false },
        },
    };
}
describe('inflowPreservation', () => {
    it('returns ~1.0 at SS=0', () => {
        expect(inflowPreservation(0)).toBeCloseTo(1.0);
    });
    it('returns 0.5 at SS=1', () => {
        expect(inflowPreservation(1)).toBeCloseTo(0.5);
    });
});
describe('storagePreservationFactor', () => {
    it('returns ~1.0 at SS=0', () => {
        expect(storagePreservationFactor(0)).toBeCloseTo(1.0);
    });
    it('returns 0.95 at SS=1', () => {
        expect(storagePreservationFactor(1)).toBeCloseTo(0.95);
    });
});
describe('getTransportStarvation', () => {
    it('returns 0 when department is null', () => {
        const storage = makeStorageFacility({ department: null as unknown as StorageDepartment });
        expect(getTransportStarvation(storage)).toBe(0);
    });
    it('returns department transport starvation when present', () => {
        const storage = makeStorageFacility();
        storage.department!.transportStarvation = 0.42;
        expect(getTransportStarvation(storage)).toBe(0.42);
    });
});
describe('per-form storage starvation', () => {
    it('returns each shell starvation separately', () => {
        const storage = makeStorageFacility();
        storage.shells.solid.storageStarvation = 0.7;
        storage.shells.liquid.storageStarvation = 0.2;
        expect(getFormStorageStarvation(storage, 'solid')).toBe(0.7);
        expect(getFormStorageStarvation(storage, 'liquid')).toBe(0.2);
    });
    it('degrades only the storage form under starvation', () => {
        const solidIron = makeResource('Iron Ore', 1);
        const liquidWater = makeResource('Water', 1);
        liquidWater.form = 'liquid';
        const assets = makeAssets();
        const storage = assets.storage;
        storage.shells.solid.compartments['Iron Ore'] = 1;
        storage.shells.liquid.compartments.Water = 1;
        storage.shells.solid.storageStarvation = 1;
        storage.shells.liquid.storageStarvation = 0;
        putIntoStorageFacility(storage, solidIron, 1000);
        putIntoStorageFacility(storage, liquidWater, 1000);
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        expect(queryStorageFacility(storage, 'Iron Ore')).toBeLessThan(1000);
        expect(queryStorageFacility(storage, 'Water')).toBe(1000);
    });
    it('degrades services faster when transport starvation is high', () => {
        const assets = makeAssets();
        const storage = assets.storage;
        storage.department!.transportStarvation = 1;
        putIntoStorageFacility(storage, logisticsServiceResourceType, 1000);
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        expect(queryStorageFacility(storage, logisticsServiceResourceType.name)).toBeLessThan(1000);
    });
});
describe('transport buffer accounting on the logistics department', () => {
    it('relaxes transport starvation when buffer is not negative', () => {
        const assets = makeAssets();
        const dept = assets.storage.department!;
        dept.transportStarvation = 0.5;
        dept.transportBuffer = 100000;
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        expect(dept.transportStarvation).toBeLessThan(0.5);
    });
    it('drives transport starvation up when transport buffer is negative', () => {
        const assets = makeAssets();
        const dept = assets.storage.department!;
        dept.transportStarvation = 0.1;
        dept.transportBuffer = -70000;
        dept.scale = 5;
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        expect(dept.transportStarvation).toBeGreaterThan(0.1);
    });
    it('credits the transport buffer from produced internal logistics service', () => {
        const assets = makeAssets();
        const dept = assets.storage.department!;
        dept.transportBuffer = -100;
        putIntoStorageFacility(assets.storage, internalLogisticsServiceResourceType, 5000);
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        expect(dept.transportBuffer).toBeGreaterThanOrEqual(0);
    });
    it('fails to credit per-form buffers from the dept produced internal logistics', () => {
        const assets = makeAssets();
        const dept = assets.storage.department!;
        dept.transportBuffer = -100;
        for (const form of storageFormKeys()) {
            assets.storage.shells[form].storageBuffer = -100;
        }
        putIntoStorageFacility(assets.storage, internalLogisticsServiceResourceType, 5000);
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        expect(dept.transportBuffer).toBeGreaterThanOrEqual(0);
        for (const form of storageFormKeys()) {
            expect(assets.storage.shells[form].storageBuffer).toBeLessThanOrEqual(0);
        }
    });
    it('skips agents without commercial license', () => {
        const assets = makeAssets();
        assets.licenses = {};
        const dept = assets.storage.department!;
        dept.transportBuffer = -100;
        const planet = makePlanet();
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        storageLogisticsTick(new Map([['a', agent]]), planet);
        expect(dept.transportBuffer).toBe(-100);
    });
});
