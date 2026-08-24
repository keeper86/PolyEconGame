import { afterEach, describe, expect, it } from 'vitest';
import { putIntoStorageFacility } from './facility';
import { logisticsServiceResourceType } from './services';
import {
    makeAgent,
    makeAgentPlanetAssets,
    makePlanet,
    makeProductionFacility,
    makeStorageFacility,
} from '../utils/testHelper';
import { resetServiceOutputShieldFactor, setServiceOutputShieldFactor, storageLogisticsTick } from './storageLogistics';

describe('service output shield', () => {
    afterEach(() => {
        resetServiceOutputShieldFactor();
    });

    function makeAssetsWithOutput(outputPerTick: number) {
        const facility = makeProductionFacility();
        facility.lastTickResults.lastProduced[logisticsServiceResourceType.name] = outputPerTick;
        const storage = makeStorageFacility();
        storage.department!.storageBuffer = 1e6;
        storage.department!.storageStarvation = 0;
        const assets = makeAgentPlanetAssets('p', {
            productionFacilities: [facility],
            storageFacility: storage,
        });
        return { assets, storage };
    }

    it('shields produced output up to factor × output per tick', () => {
        setServiceOutputShieldFactor(3);
        const { assets, storage } = makeAssetsWithOutput(1000);
        putIntoStorageFacility(storage, logisticsServiceResourceType, 3000);
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });

        storageLogisticsTick(new Map([['a', agent]]), makePlanet());

        const remaining = storage.currentInStorage[logisticsServiceResourceType.name]?.quantity ?? 0;
        expect(remaining).toBeCloseTo(3000, 3);
    });

    it('decays only the output above the shielded base', () => {
        setServiceOutputShieldFactor(3);
        const { assets, storage } = makeAssetsWithOutput(1000);
        putIntoStorageFacility(storage, logisticsServiceResourceType, 3000);
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        const planet = makePlanet();

        storageLogisticsTick(new Map([['a', agent]]), planet);

        putIntoStorageFacility(storage, logisticsServiceResourceType, 2000);
        storageLogisticsTick(new Map([['a', agent]]), planet);

        const remaining = storage.currentInStorage[logisticsServiceResourceType.name]?.quantity ?? 0;
        expect(remaining).toBeCloseTo(4800, 1);
    });

    it('exposes services the agent only consumes (no output base)', () => {
        setServiceOutputShieldFactor(3);
        const facility = makeProductionFacility();
        facility.lastTickResults.lastConsumed[logisticsServiceResourceType.name] = 1000;
        const storage = makeStorageFacility();
        storage.department!.storageBuffer = 1e6;
        storage.department!.storageStarvation = 0;
        const assets = makeAgentPlanetAssets('p', {
            productionFacilities: [facility],
            storageFacility: storage,
        });
        putIntoStorageFacility(storage, logisticsServiceResourceType, 3000);
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });

        storageLogisticsTick(new Map([['a', agent]]), makePlanet());

        const remaining = storage.currentInStorage[logisticsServiceResourceType.name]?.quantity ?? 0;
        expect(remaining).toBeLessThan(3000);
    });
});
