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
        assets.storage.shells.liquid.scale = 30; // chemical is liquid; give enough physical room to hold 1M+ units
        assets.storage.shells.liquid.maxScale = assets.storage.shells.liquid.scale;
        assets.storage.shells.liquid.compartments[chemicalResourceType.name] = 1;
        putIntoStorageFacility(assets.storage, chemicalResourceType, 1_000_000);
        wasteSurplusOutputs(assets);
        const keep = 30 * 100 * 48;
        expect(queryStorageFacility(assets.storage, chemicalResourceType.name)).toBeCloseTo(keep, 6);
    });

    it('does not touch inventory below the keep level', () => {
        const assets = makeAgentPlanetAssets('p');
        assets.productionFacilities.push(makeWasteFacility());
        assets.storage.shells.liquid.compartments[fuelResourceType.name] = 1;
        putIntoStorageFacility(assets.storage, fuelResourceType, 5_000);
        wasteSurplusOutputs(assets);
        expect(queryStorageFacility(assets.storage, fuelResourceType.name)).toBeCloseTo(5_000, 6);
    });

    it('leaves facilities without the waste config untouched', () => {
        const assets = makeAgentPlanetAssets('p');
        assets.productionFacilities.push(
            makeProductionFacility(undefined, {
                produces: [{ resource: plasticResourceType, quantity: 10 }],
            }),
        );
        assets.storage.shells.solid.scale = 40; // plastic is a solid; hold the 1M-unit leftover untouched
        assets.storage.shells.solid.maxScale = assets.storage.shells.solid.scale;
        assets.storage.shells.solid.compartments[plasticResourceType.name] = 1;
        putIntoStorageFacility(assets.storage, plasticResourceType, 1_000_000);
        wasteSurplusOutputs(assets);
        expect(queryStorageFacility(assets.storage, plasticResourceType.name)).toBeCloseTo(1_000_000, 6);
    });
});
