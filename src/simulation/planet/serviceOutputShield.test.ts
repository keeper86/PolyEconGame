import { describe, expect, it } from 'vitest';
import { putIntoStorageFacility, queryStorageFacility } from './facility';
import { logisticsServiceResourceType } from './services';
import {
    makeAgent,
    makeAgentPlanetAssets,
    makePlanet,
    makeProductionFacility,
    makeStorageFacility,
} from '../utils/testHelper';
import { storageLogisticsTick } from './storageLogistics';

describe('service output shield', () => {
    function makeAssetsWithOutput(outputPerTick: number) {
        const facility = makeProductionFacility();
        facility.lastTickResults.lastProduced[logisticsServiceResourceType.name] = outputPerTick;
        const storage = makeStorageFacility();
        storage.department!.transportBuffer = 1e6;
        storage.department!.transportStarvation = 0;
        const assets = makeAgentPlanetAssets('p', {
            productionFacilities: [facility],
            storage: storage,
        });
        return { assets, storage };
    }

    it('shields produced output up to one tick of output per tick', () => {
        const { assets, storage } = makeAssetsWithOutput(1000);
        putIntoStorageFacility(storage, logisticsServiceResourceType, 1000);
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });

        storageLogisticsTick(new Map([['a', agent]]), makePlanet());

        const remaining = queryStorageFacility(storage, logisticsServiceResourceType.name);
        expect(remaining).toBeCloseTo(1000, 3);
        expect(assets.monthAcc.naturalDepreciationValue).toBeCloseTo(0, 3);
    });

    it('decays only the output above the shielded base', () => {
        const { assets, storage } = makeAssetsWithOutput(1000);
        putIntoStorageFacility(storage, logisticsServiceResourceType, 5000);
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });

        storageLogisticsTick(new Map([['a', agent]]), makePlanet());

        const remaining = queryStorageFacility(storage, logisticsServiceResourceType.name);
        expect(remaining).toBeCloseTo(4600, 1);
    });

    it('exposes services the agent only consumes (no output base)', () => {
        const facility = makeProductionFacility();
        facility.lastTickResults.lastConsumed[logisticsServiceResourceType.name] = 1000;
        const storage = makeStorageFacility();
        storage.department!.transportBuffer = 1e6;
        storage.department!.transportStarvation = 0;
        const assets = makeAgentPlanetAssets('p', {
            productionFacilities: [facility],
            storage: storage,
        });
        putIntoStorageFacility(storage, logisticsServiceResourceType, 1000);
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });

        storageLogisticsTick(new Map([['a', agent]]), makePlanet());

        const remaining = queryStorageFacility(storage, logisticsServiceResourceType.name);
        expect(remaining).toBeCloseTo(900, 1);
    });
});
