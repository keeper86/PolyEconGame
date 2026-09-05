import { describe, expect, it } from 'vitest';
import { makeAgentPlanetAssets, makeProductionFacility } from '../utils/testHelper';
import { putIntoStorageFacility, queryStorageFacility } from './facility';
import { chemicalResourceType, fuelResourceType, plasticResourceType } from './resources';
import { wasteSurplusOutputs } from './storageLogistics';

function makeWasteFacility() {
    const facility = makeProductionFacility(undefined, {
        maxScale: 100,
        scale: 100,
        wasteSurplusTicks: 30,
        produces: [
            { resource: fuelResourceType, quantity: 90 },
            { resource: plasticResourceType, quantity: 62 },
            { resource: chemicalResourceType, quantity: 48 },
        ],
    });
    return facility;
}

describe('wasteSurplusOutputs', () => {
    it('flares surplus goods output down to the configured keep level', () => {
        const assets = makeAgentPlanetAssets('p');
        assets.productionFacilities.push(makeWasteFacility());
        putIntoStorageFacility(assets.storageFacility, chemicalResourceType, 1_000_000);
        wasteSurplusOutputs(assets);
        const keep = 30 * 100 * 48;
        expect(queryStorageFacility(assets.storageFacility, chemicalResourceType.name)).toBeCloseTo(keep, 6);
    });

    it('does not touch inventory below the keep level', () => {
        const assets = makeAgentPlanetAssets('p');
        assets.productionFacilities.push(makeWasteFacility());
        putIntoStorageFacility(assets.storageFacility, fuelResourceType, 5_000);
        wasteSurplusOutputs(assets);
        expect(queryStorageFacility(assets.storageFacility, fuelResourceType.name)).toBeCloseTo(5_000, 6);
    });

    it('leaves facilities without the waste config untouched', () => {
        const assets = makeAgentPlanetAssets('p');
        assets.productionFacilities.push(
            makeProductionFacility(undefined, {
                produces: [{ resource: plasticResourceType, quantity: 10 }],
            }),
        );
        putIntoStorageFacility(assets.storageFacility, plasticResourceType, 1_000_000);
        wasteSurplusOutputs(assets);
        expect(queryStorageFacility(assets.storageFacility, plasticResourceType.name)).toBeCloseTo(1_000_000, 6);
    });
});
