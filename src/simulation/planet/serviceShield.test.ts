import { describe, expect, it } from 'vitest';
import { SERVICE_DEPRECIATION_RATE_PER_TICK } from '../constants';
import { putIntoStorageFacility } from './facility';
import { logisticsServiceResourceType } from './services';
import {
    makeAgent,
    makeAgentPlanetAssets,
    makePlanet,
    makeProductionFacility,
    makeStorageFacility,
} from '../utils/testHelper';
import {
    getServiceDepreciationRate,
    resetServiceBufferShieldTicks,
    resetServiceDepreciationRate,
    setServiceBufferShieldTicks,
    setServiceDepreciationRate,
    storageLogisticsTick,
} from './storageLogistics';

describe('service shield', () => {
    afterEach(() => {
        resetServiceDepreciationRate();
        resetServiceBufferShieldTicks();
    });

    it('uses the unshielded base rate by default', () => {
        expect(getServiceDepreciationRate()).toBeCloseTo(SERVICE_DEPRECIATION_RATE_PER_TICK);
    });

    it('applies a shield when the effective rate is overridden below the base', () => {
        setServiceDepreciationRate(SERVICE_DEPRECIATION_RATE_PER_TICK * 0.5);
        expect(getServiceDepreciationRate()).toBeCloseTo(SERVICE_DEPRECIATION_RATE_PER_TICK * 0.5);
    });

    it('honors an explicit rate override over the shield', () => {
        setServiceDepreciationRate(SERVICE_DEPRECIATION_RATE_PER_TICK);
        expect(getServiceDepreciationRate()).toBeCloseTo(SERVICE_DEPRECIATION_RATE_PER_TICK);
    });
});

describe('service buffer shield', () => {
    afterEach(() => {
        resetServiceBufferShieldTicks();
        resetServiceDepreciationRate();
    });

    function makeAssetsWithFlow(flowPerTick: number) {
        const facility = makeProductionFacility();
        facility.lastTickResults.lastProduced[logisticsServiceResourceType.name] = flowPerTick;
        const storage = makeStorageFacility();
        storage.department!.storageBuffer = 1e6;
        storage.department!.storageStarvation = 0;
        const assets = makeAgentPlanetAssets('p', {
            productionFacilities: [facility],
            storageFacility: storage,
        });
        return { assets, storage };
    }

    it('shields the first x ticks of flow from depreciation', () => {
        setServiceBufferShieldTicks(3);
        const { assets, storage } = makeAssetsWithFlow(1000);
        putIntoStorageFacility(storage, logisticsServiceResourceType, 3000);
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });

        storageLogisticsTick(new Map([['a', agent]]), makePlanet());

        const remaining = storage.currentInStorage[logisticsServiceResourceType.name]?.quantity ?? 0;
        expect(remaining).toBeCloseTo(3000, 3);
        expect(assets.monthAcc.naturalDepreciationValue).toBeCloseTo(0, 3);
    });

    it('depreciates only the quantity above the shielded base', () => {
        setServiceBufferShieldTicks(3);
        const { assets, storage } = makeAssetsWithFlow(1000);
        putIntoStorageFacility(storage, logisticsServiceResourceType, 3000);
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        const planet = makePlanet();

        storageLogisticsTick(new Map([['a', agent]]), planet);

        putIntoStorageFacility(storage, logisticsServiceResourceType, 2000);
        storageLogisticsTick(new Map([['a', agent]]), planet);

        const remaining = storage.currentInStorage[logisticsServiceResourceType.name]?.quantity ?? 0;
        expect(remaining).toBeCloseTo(4800, 1);
    });

    it('without the shield, the full stored quantity is exposed to decay', () => {
        const { assets, storage } = makeAssetsWithFlow(1000);
        putIntoStorageFacility(storage, logisticsServiceResourceType, 3000);
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });

        storageLogisticsTick(new Map([['a', agent]]), makePlanet());

        const remaining = storage.currentInStorage[logisticsServiceResourceType.name]?.quantity ?? 0;
        expect(remaining).toBeLessThan(3000);
    });
});
