import { describe, expect, it } from 'vitest';
import { makeAgent, makeGameState, makePlanet, makeProductionFacility } from '../utils/testHelper';
import type { AgentPlanetAssets } from './planet';
import { putIntoStorageFacility } from './facility';
import { updateProductionMix } from './productionMix';
import { chemicalResourceType, fuelResourceType, plasticResourceType } from './resources';

function makeRefineryFixture(): {
    facility: ReturnType<typeof makeProductionFacility>;
    assets: AgentPlanetAssets;
    gameState: ReturnType<typeof makeGameState>;
} {
    const planet = makePlanet({});
    const facility = makeProductionFacility(
        {},
        {
            outputFlexible: true,
            produces: [
                { resource: fuelResourceType, quantity: 90 },
                { resource: plasticResourceType, quantity: 62 },
                { resource: chemicalResourceType, quantity: 48 },
            ],
        },
    );
    const agent = makeAgent('refinery-company', planet.id, 'Refinery Co');
    const assets = agent.assets[planet.id];
    assets.productionFacilities = [facility];
    const gameState = makeGameState(planet, [agent]);
    return { facility, assets, gameState };
}

describe('updateProductionMix', () => {
    it('initializes the mix from the template quantities', () => {
        const { facility, gameState } = makeRefineryFixture();
        updateProductionMix(gameState, makePlanet({}));
        expect(facility.productionMix![fuelResourceType.name]).toBeCloseTo(90 / 200, 5);
        expect(facility.productionMix![plasticResourceType.name]).toBeCloseTo(62 / 200, 5);
        expect(facility.productionMix![chemicalResourceType.name]).toBeCloseTo(48 / 200, 5);
    });

    it('shifts the mix away from an output whose storage is at the keep target', () => {
        const { facility, assets, gameState } = makeRefineryFixture();
        const planet = makePlanet({});
        updateProductionMix(gameState, planet);

        const keep = 30 * facility.maxScale * 48;
        putIntoStorageFacility(assets.storageFacility, chemicalResourceType, keep * 2);
        const before = facility.productionMix![chemicalResourceType.name];
        for (let i = 0; i < 300; i++) {
            updateProductionMix(gameState, planet);
        }
        expect(facility.productionMix![chemicalResourceType.name]).toBeLessThan(before);
        expect(facility.productionMix![chemicalResourceType.name]).toBeGreaterThanOrEqual(0.09);
        expect(facility.productionMix![fuelResourceType.name]).toBeGreaterThan(90 / 200);
    });

    it('keeps every product above the minimum share even when one output is saturated', () => {
        const { facility, assets, gameState } = makeRefineryFixture();
        const planet = makePlanet({});
        updateProductionMix(gameState, planet);

        const keep = 30 * facility.maxScale * 48;
        putIntoStorageFacility(assets.storageFacility, chemicalResourceType, keep * 2);
        for (let i = 0; i < 500; i++) {
            updateProductionMix(gameState, planet);
        }
        expect(facility.productionMix![fuelResourceType.name]).toBeGreaterThanOrEqual(0.09);
        expect(facility.productionMix![plasticResourceType.name]).toBeGreaterThanOrEqual(0.09);
        expect(facility.productionMix![chemicalResourceType.name]).toBeGreaterThanOrEqual(0.09);
        expect(facility.productionMix![chemicalResourceType.name]).toBeLessThan(0.2);
    });

    it('converges to the template shares when every output is equally depleted', () => {
        const { facility, gameState } = makeRefineryFixture();
        const planet = makePlanet({});
        updateProductionMix(gameState, planet);
        for (let i = 0; i < 500; i++) {
            updateProductionMix(gameState, planet);
        }
        expect(facility.productionMix![fuelResourceType.name]).toBeCloseTo(90 / 200, 2);
        expect(facility.productionMix![plasticResourceType.name]).toBeCloseTo(62 / 200, 2);
        expect(facility.productionMix![chemicalResourceType.name]).toBeCloseTo(48 / 200, 2);
    });
});
