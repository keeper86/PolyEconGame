import { beforeEach, describe, expect, it } from 'vitest';

import { advanceTick, seedRng } from './engine';
import { environmentTick } from './planet/environment';
import type { ProductionFacility, Resource } from './planet/facilities';
import { agriculturalProductResourceType, putIntoStorageFacility, queryStorageFacility } from './planet/facilities';
import type { Agent, Planet } from './planet/planet';
import { productionTick } from './planet/production';
import type { EducationLevelType } from './population/education';
import { populationTick } from './population/populationTick';
import {
    makeAgent,
    makeEnvironment,
    makeGameState,
    makeGovernmentAgent,
    makePlanet,
    makePopulationWithWorkers,
    makeProductionFacility,
    makeWorld,
    totalPopulation,
} from './utils/testHelper';
import { assertWorkforcePopulationConsistency } from './utils/testAssertions';

/**
 * Sets up actual hired workers in the agent's workforceDemography for a planet.
 * Workers are placed at age 30, skill 'novice'. This is what productionTick reads.
 */
function setActualWorkers(agent: Agent, planetId: string, workers: Partial<Record<EducationLevelType, number>>) {
    const wf = agent.assets[planetId].workforceDemography;
    for (const [edu, count] of Object.entries(workers)) {
        if (count !== undefined && count > 0) {
            wf[30][edu as EducationLevelType].novice.active = count;
        }
    }
}

describe('engine basic behavior', () => {
    let planet: Planet;
    let government: Agent;

    beforeEach(() => {
        government = makeGovernmentAgent('gov-1', 'planet-1');
        planet = makePlanet({
            id: 'planet-1',
            governmentId: government.id,
            environment: makeEnvironment({
                pollution: { air: 10, water: 5, soil: 2 },
                regenerationRates: {
                    air: { constant: 1, percentage: 0 },
                    water: { constant: 1, percentage: 0 },
                    soil: { constant: 1, percentage: 0 },
                },
            }),
        });
    });

    it('environmentTick reduces pollution by regenerationRates (not below 0)', () => {
        const gs = makeGameState(planet, [], 0);
        const regen = planet.environment.regenerationRates;
        const expectedAir = Math.max(
            0,
            planet.environment.pollution.air -
                regen.air.constant -
                planet.environment.pollution.air * regen.air.percentage,
        );
        const expectedWater = Math.max(
            0,
            planet.environment.pollution.water -
                regen.water.constant -
                planet.environment.pollution.water * regen.water.percentage,
        );
        const expectedSoil = Math.max(
            0,
            planet.environment.pollution.soil -
                regen.soil.constant -
                planet.environment.pollution.soil * regen.soil.percentage,
        );
        environmentTick(gs);
        expect(planet.environment.pollution.air).toBe(expectedAir);
        expect(planet.environment.pollution.water).toBe(expectedWater);
        expect(planet.environment.pollution.soil).toBe(expectedSoil);
    });

    it('productionTick adds produced resources to agent storage', () => {
        const agent = makeAgent('agent-1', planet.id);

        // production facility that produces 10 agricultural product per tick, no needs, no worker requirements
        const prod = makeProductionFacility(
            {},
            {
                planetId: planet.id,
                id: 'pf1',
                name: 'farm',
                produces: [{ resource: agriculturalProductResourceType, quantity: 10 }],
            },
        );

        agent.assets[planet.id].productionFacilities.push(prod);

        const gameState = makeGameState(planet, [agent], 0);

        productionTick(gameState);

        const entry = agent.assets[planet.id].storageFacility.currentInStorage[agriculturalProductResourceType.name];
        expect(entry).toBeDefined();
        expect(entry!.quantity).toBeGreaterThanOrEqual(10);
    });

    it('productionTick does remove needed resources from storage', () => {
        const agent = makeAgent('agent-1', planet.id);

        const neededResource: Resource = {
            name: 'Needed Resource',
            type: 'solid',
            volumePerQuantity: 1,
            massPerQuantity: 1,
        };

        const neededResourceQuantity = 10;
        const producedResourceQuantity = 10;

        const prod = makeProductionFacility(
            {},
            {
                planetId: planet.id,
                id: 'pf1',
                name: 'factory',
                needs: [{ resource: neededResource, quantity: neededResourceQuantity }],
                produces: [{ resource: agriculturalProductResourceType, quantity: producedResourceQuantity }],
            },
        );

        agent.assets[planet.id].productionFacilities.push(prod);

        // put some needed resource into storage
        const storage = agent.assets[planet.id].storageFacility;
        putIntoStorageFacility(storage, neededResource, neededResourceQuantity);

        const gameState = makeGameState(planet, [agent], 0);

        productionTick(gameState);

        const storageOfNeededResource = queryStorageFacility(storage, neededResource.name);
        expect(storageOfNeededResource).toBeDefined();
        expect(storageOfNeededResource).toBe(0);

        const storageOfProducedResource = queryStorageFacility(storage, agriculturalProductResourceType.name);
        expect(storageOfProducedResource).toBeDefined();
        expect(storageOfProducedResource).toBe(producedResourceQuantity);
    });

    it('productionTick does only produce proportionally to available needed resources', () => {
        const agent = makeAgent('agent-1', planet.id);

        const neededResource: Resource = {
            name: 'Needed Resource',
            type: 'solid',
            volumePerQuantity: 1,
            massPerQuantity: 1,
        };

        const neededResourceQuantity = 10;
        const producedResourceQuantity = 10;

        const prod = makeProductionFacility(
            {},
            {
                planetId: planet.id,
                id: 'pf1',
                name: 'factory',
                needs: [{ resource: neededResource, quantity: neededResourceQuantity }],
                produces: [{ resource: agriculturalProductResourceType, quantity: producedResourceQuantity }],
            },
        );
        agent.assets[planet.id].productionFacilities.push(prod);

        const storage = agent.assets[planet.id].storageFacility;
        putIntoStorageFacility(storage, neededResource, neededResourceQuantity / 10);

        const storageOfNeededResource = queryStorageFacility(storage, neededResource.name);
        expect(storageOfNeededResource).toBeDefined();
        expect(storageOfNeededResource).toBe(1);

        const gameState = makeGameState(planet, [agent], 0);
        productionTick(gameState);

        const storageOfProducedResource = queryStorageFacility(storage, agriculturalProductResourceType.name);
        expect(storageOfProducedResource).toBeDefined();
        // With 1/10 available needed resource, production should be 1/10.
        expect(storageOfProducedResource).toBe(producedResourceQuantity / 10);
    });

    it('productionTick only produce proportional when there are not enough workers.', () => {
        const agent = makeAgent('agent-1', planet.id);

        const prod = makeProductionFacility(
            { none: 10 },
            {
                planetId: planet.id,
                id: 'pf1',
                name: 'factory',
                produces: [{ resource: agriculturalProductResourceType, quantity: 10 }],
            },
        );
        agent.assets[planet.id].productionFacilities.push(prod);

        const storage = agent.assets[planet.id].storageFacility;

        // Set 5 actual hired workers (via workforce demography) of the required 10
        setActualWorkers(agent, planet.id, { none: 5 });

        const gameState = makeGameState(planet, [agent], 0);
        productionTick(gameState);

        const storageOfProducedResource = queryStorageFacility(storage, agriculturalProductResourceType.name);
        expect(storageOfProducedResource).toBeDefined();
        // With only 5 of the required 10 workers, production should be 50%.
        expect(storageOfProducedResource).toBe(5);
    });

    it('populationTick runs without error on a populated planet', () => {
        // Create a planet with actual population so populationTick has something to process
        const pop = makePopulationWithWorkers(1000, { edu: 'none', skill: 'novice' });
        planet.population = pop;

        const gameState = makeGameState(planet, [government], 0);

        // Should not throw
        populationTick(gameState);

        const popAfter = totalPopulation(planet);
        // Population should still be positive (no starvation deaths in 1 tick with foodStock)
        expect(popAfter).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// Worker education downhill fallback in productionTick
// ---------------------------------------------------------------------------

describe('productionTick worker education fallback', () => {
    let planet: Planet;

    beforeEach(() => {
        planet = makePlanet({ id: 'planet-1' });
    });

    function makeFacilityWithWorkerReq(
        planetId: string,
        workerRequirement: Partial<Record<string, number>>,
    ): ProductionFacility {
        return makeProductionFacility(workerRequirement as Partial<Record<EducationLevelType, number>>, {
            planetId,
            id: 'pf-test',
            name: 'test-facility',
            produces: [{ resource: agriculturalProductResourceType, quantity: 100 }],
        });
    }

    it('fills worker requirement exactly when matching education is available', () => {
        const agent = makeAgent('agent-1', planet.id);
        setActualWorkers(agent, planet.id, { primary: 10 });
        expect(agent.assets[planet.id].productionFacilities.length).toBe(0);
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { primary: 10 }));

        const gs = makeGameState(planet, [agent], 0);
        productionTick(gs);

        const facility = agent.assets[planet.id].productionFacilities[0];
        expect(facility.lastTickResults?.overallEfficiency).toBe(1);
        expect(facility.lastTickResults?.overqualifiedWorkers).toEqual({});
    });

    it('uses higher-educated workers when lower bracket is exhausted', () => {
        const agent = makeAgent('agent-1', planet.id);
        // Need 10 "none" workers, but we only have secondary workers
        setActualWorkers(agent, planet.id, { none: 0, secondary: 10 });
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { none: 10 }));

        const gs = makeGameState(planet, [agent], 0);
        productionTick(gs);

        const facility = agent.assets[planet.id].productionFacilities[0];
        expect(facility.lastTickResults?.overallEfficiency).toBe(1);
        expect(facility.lastTickResults?.overqualifiedWorkers).toEqual({ none: { secondary: 10 } });
    });

    it('partially fills from exact match and remainder from higher education', () => {
        const agent = makeAgent('agent-1', planet.id);
        // Need 10 "none", have 6 "none" + 4 "primary"
        setActualWorkers(agent, planet.id, { none: 6, primary: 4 });
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { none: 10 }));

        const gs = makeGameState(planet, [agent], 0);
        productionTick(gs);

        const facility = agent.assets[planet.id].productionFacilities[0];
        expect(facility.lastTickResults?.overallEfficiency).toBe(1);
        expect(facility.lastTickResults?.overqualifiedWorkers).toEqual({ none: { primary: 4 } });
    });

    it('reduces efficiency when even fallback cannot fill requirement', () => {
        const agent = makeAgent('agent-1', planet.id);
        // Need 10 "none", but only 3 total workers across all edu levels
        setActualWorkers(agent, planet.id, { none: 1, primary: 1, secondary: 1 });
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { none: 10 }));

        const gs = makeGameState(planet, [agent], 0);
        productionTick(gs);

        const facility = agent.assets[planet.id].productionFacilities[0];
        // 3/10 = 0.3
        expect(facility.lastTickResults?.overallEfficiency).toBe(0.3);
        expect(facility.lastTickResults?.overqualifiedWorkers).toEqual({ none: { primary: 1, secondary: 1 } });
    });

    it('does not use lower-educated workers to fill higher requirements', () => {
        const agent = makeAgent('agent-1', planet.id);
        // Need 10 "secondary", only have "none" and "primary" — cannot fill
        setActualWorkers(agent, planet.id, { none: 100, primary: 100, secondary: 0 });
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { secondary: 10 }));

        const gs = makeGameState(planet, [agent], 0);
        productionTick(gs);

        const facility = agent.assets[planet.id].productionFacilities[0];
        expect(facility.lastTickResults?.overallEfficiency).toBe(0);
    });

    it('deducts overqualified workers from remainingWorker so second facility sees fewer', () => {
        const agent = makeAgent('agent-1', planet.id);
        // 10 secondary workers total
        setActualWorkers(agent, planet.id, { secondary: 10 });

        // Facility 1 needs 6 "none" — will use 6 secondary (overqualified)
        // Facility 2 needs 10 "secondary" — only 4 remaining
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { none: 6 }));
        const facility2 = makeFacilityWithWorkerReq(planet.id, { secondary: 10 });
        facility2.id = 'pf-test-2';
        agent.assets[planet.id].productionFacilities.push(facility2);

        const gs = makeGameState(planet, [agent], 0);
        productionTick(gs);

        const f1 = agent.assets[planet.id].productionFacilities[0];
        const f2 = agent.assets[planet.id].productionFacilities[1];

        expect(f1.lastTickResults?.overallEfficiency).toBe(1);
        expect(f1.lastTickResults?.overqualifiedWorkers).toEqual({ none: { secondary: 6 } });

        // Only 4 secondary remain for facility 2
        expect(f2.lastTickResults?.overallEfficiency).toBe(0.4);
        expect(f2.lastTickResults?.overqualifiedWorkers).toEqual({});
    });

    it('walks through multiple education levels to fill a single requirement', () => {
        const agent = makeAgent('agent-1', planet.id);
        // Need 10 "none", have 2 none + 3 primary + 2 secondary + 3 tertiary = 10
        setActualWorkers(agent, planet.id, { none: 2, primary: 3, secondary: 2, tertiary: 3 });
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { none: 10 }));

        const gs = makeGameState(planet, [agent], 0);
        productionTick(gs);

        const facility = agent.assets[planet.id].productionFacilities[0];
        expect(facility.lastTickResults?.overallEfficiency).toBe(1);
        // 8 overqualified (3 primary + 2 secondary + 3 tertiary)
        expect(facility.lastTickResults?.overqualifiedWorkers).toEqual({
            none: { primary: 3, secondary: 2, tertiary: 3 },
        });
    });
});

// ---------------------------------------------------------------------------
// Two-pass allocation: exact match first, then cascade
// ---------------------------------------------------------------------------

describe('productionTick two-pass worker allocation', () => {
    let planet: Planet;

    beforeEach(() => {
        planet = makePlanet({ id: 'planet-1' });
    });

    function makeFacilityWithWorkerReq(
        planetId: string,
        workerRequirement: Partial<Record<string, number>>,
    ): ProductionFacility {
        return makeProductionFacility(workerRequirement as Partial<Record<EducationLevelType, number>>, {
            planetId,
            id: `pf-${Math.random().toString(36).slice(2, 8)}`,
            name: 'test-facility',
            produces: [{ resource: agriculturalProductResourceType, quantity: 100 }],
        });
    }

    it('does not let none-cascade starve the primary slot', () => {
        const agent = makeAgent('agent-1', planet.id);
        setActualWorkers(agent, planet.id, { none: 0, primary: 5 });
        agent.assets[planet.id].productionFacilities.push(
            makeFacilityWithWorkerReq(planet.id, { none: 10, primary: 5 }),
        );

        const gs = makeGameState(planet, [agent], 0);
        productionTick(gs);

        const facility = agent.assets[planet.id].productionFacilities[0];
        const results = facility.lastTickResults!;
        // Primary slot should be 100% — exact match was reserved in pass 1
        expect(results.workerEfficiency!.primary).toBe(1);
        // None slot should be 0% — no none workers and no cascade candidates
        expect(results.workerEfficiency!.none).toBe(0);
        // Overall efficiency is min of all slots → 0
        expect(facility.lastTickResults?.overallEfficiency).toBe(0);
    });

    it('cascades surplus higher-edu workers to lower slots only after exact matches', () => {
        const agent = makeAgent('agent-1', planet.id);
        setActualWorkers(agent, planet.id, { none: 0, primary: 8, secondary: 6 });
        agent.assets[planet.id].productionFacilities.push(
            makeFacilityWithWorkerReq(planet.id, { none: 5, primary: 8, secondary: 6 }),
        );

        const gs = makeGameState(planet, [agent], 0);
        productionTick(gs);

        const results = agent.assets[planet.id].productionFacilities[0].lastTickResults!;
        expect(results.workerEfficiency!.primary).toBe(1);
        expect(results.workerEfficiency!.secondary).toBe(1);
        expect(results.workerEfficiency!.none).toBe(0);
    });

    it('cascades leftover higher-edu workers after exact-match slots are filled', () => {
        const agent = makeAgent('agent-1', planet.id);
        setActualWorkers(agent, planet.id, { none: 0, primary: 15 });
        agent.assets[planet.id].productionFacilities.push(
            makeFacilityWithWorkerReq(planet.id, { none: 5, primary: 10 }),
        );

        const gs = makeGameState(planet, [agent], 0);
        productionTick(gs);

        const results = agent.assets[planet.id].productionFacilities[0].lastTickResults!;
        expect(results.workerEfficiency!.none).toBe(1);
        expect(results.workerEfficiency!.primary).toBe(1);
        expect(results.workerEfficiencyOverall).toBe(1);
        // The none slot was filled with 5 overqualified primary workers
        expect(results.overqualifiedWorkers).toEqual({ none: { primary: 5 } });
    });

    it('partially cascades when surplus is insufficient to fully fill lower slot', () => {
        const agent = makeAgent('agent-1', planet.id);
        setActualWorkers(agent, planet.id, { none: 0, primary: 12 });
        agent.assets[planet.id].productionFacilities.push(
            makeFacilityWithWorkerReq(planet.id, { none: 5, primary: 10 }),
        );

        const gs = makeGameState(planet, [agent], 0);
        productionTick(gs);

        const results = agent.assets[planet.id].productionFacilities[0].lastTickResults!;
        expect(results.workerEfficiency!.primary).toBe(1);
        expect(results.workerEfficiency!.none).toBeCloseTo(0.4, 2);
        expect(results.overqualifiedWorkers).toEqual({ none: { primary: 2 } });
    });

    it('handles scale > 1 correctly in two-pass allocation', () => {
        const agent = makeAgent('agent-1', planet.id);
        setActualWorkers(agent, planet.id, { none: 0, primary: 30 });
        const fac = makeFacilityWithWorkerReq(planet.id, { none: 6, primary: 3 });
        fac.scale = 10;
        agent.assets[planet.id].productionFacilities.push(fac);

        const gs = makeGameState(planet, [agent], 0);
        productionTick(gs);

        const results = agent.assets[planet.id].productionFacilities[0].lastTickResults!;
        // Primary exactly filled: 30 available = 30 needed
        expect(results.workerEfficiency!.primary).toBe(1);
        // None has nothing
        expect(results.workerEfficiency!.none).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Idle worker persistence in productionTick
// ---------------------------------------------------------------------------

describe('productionTick idle worker persistence', () => {
    let planet: Planet;

    beforeEach(() => {
        planet = makePlanet({ id: 'planet-1' });
    });

    it('persists unusedWorkers and unusedWorkerFraction after production tick', () => {
        const agent = makeAgent('agent-1', planet.id);
        // Facility needs 5 "none" workers, but agent has 8 hired → 3 idle
        setActualWorkers(agent, planet.id, { none: 8 });
        agent.assets[planet.id].productionFacilities.push(makeProductionFacility({ none: 5 }, { planetId: planet.id }));

        const gs = makeGameState(planet, [agent], 1);
        productionTick(gs);

        const assets = agent.assets[planet.id];
        expect(assets.workerFeedback).toBeDefined();
        // 8 hired - 5 used (age prod ~1.0 for default age 30) → ~3 idle
        expect(assets.workerFeedback!.unusedWorkers.none).toBe(3);
        expect(assets.workerFeedback!.unusedWorkerFraction).toBeCloseTo(3 / 8, 2);
    });

    it('sets unusedWorkerFraction to 0 when all workers are used', () => {
        const agent = makeAgent('agent-1', planet.id);
        // Facility needs exactly 10 "none" workers, agent has 10
        setActualWorkers(agent, planet.id, { none: 10 });
        agent.assets[planet.id].productionFacilities.push(
            makeProductionFacility({ none: 10 }, { planetId: planet.id }),
        );

        const gs = makeGameState(planet, [agent], 1);
        productionTick(gs);

        const assets = agent.assets[planet.id];
        expect(assets.workerFeedback!.unusedWorkers.none).toBe(0);
        expect(assets.workerFeedback!.unusedWorkerFraction).toBe(0);
    });

    it('sets unusedWorkerFraction to 0 when no workers are hired', () => {
        const agent = makeAgent('agent-1', planet.id);
        // No workers hired, no facilities
        const gs = makeGameState(planet, [agent], 1);
        productionTick(gs);

        const assets = agent.assets[planet.id];
        expect(assets.workerFeedback!.unusedWorkerFraction).toBe(0);
    });
});

// ============================================================================
// Population ↔ Workforce consistency across ticks
// ============================================================================

describe('population ↔ workforce consistency', () => {
    it('maintains consistency over 60 ticks (2 months)', () => {
        seedRng(42);

        const { gameState, planet, agents } = makeWorld({
            populationByEdu: { none: 5000, primary: 3000, secondary: 1500, tertiary: 500 },
            companyIds: ['company-1'],
        });

        // Give the government agent production facilities so it has hiring targets
        const gov = agents[0];
        gov.assets[planet.id].productionFacilities.push(
            makeProductionFacility({ none: 1000, primary: 500, secondary: 200, tertiary: 50 }, { planetId: planet.id }),
        );

        // Seed food so population doesn't starve instantly
        putIntoStorageFacility(gov.assets[planet.id].storageFacility, agriculturalProductResourceType, 1e9);

        for (let t = 1; t <= 60; t++) {
            gameState.tick = t;
            advanceTick(gameState);
            assertWorkforcePopulationConsistency(planet, agents, `tick=${t}`);
        }
    });
});
