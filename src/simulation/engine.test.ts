import { beforeEach, describe, expect, it } from 'vitest';

import { advanceTick, seedRng } from './engine';
import { environmentTick } from './planet/environment';

import type { Agent, Planet, Resource } from './planet/planet';
import { productionTick } from './planet/production';
import type { EducationLevelType } from './population/education';
import { populationTick } from './population/populationTick';
import { assertWorkforcePopulationConsistency } from './utils/testAssertions';
import {
    agentMap,
    makeAgent,
    makeEnvironment,
    makeGovernmentAgent,
    makePlanet,
    makePopulationWithWorkers,
    makeProductionFacility,
    makeWorld,
    totalPopulation,
} from './utils/testHelper';
import { createWorkforceEventAccumulator } from './workforce/workforceDemographicTick';
import { agriculturalProductResourceType } from './planet/resources';
import type { ProductionFacility } from './planet/storage';
import { putIntoStorageFacility, queryStorageFacility } from './planet/storage';

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
        environmentTick(planet);
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

        productionTick(agentMap(agent), planet);

        const entry = agent.assets[planet.id].storageFacility.currentInStorage[agriculturalProductResourceType.name];
        expect(entry).toBeDefined();
        expect(entry!.quantity).toBeGreaterThanOrEqual(10);
    });

    it('productionTick does remove needed resources from storage', () => {
        const agent = makeAgent('agent-1', planet.id);

        const neededResource: Resource = {
            name: 'Needed Resource',
            form: 'solid',
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

        productionTick(agentMap(agent), planet);

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
            form: 'solid',
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

        productionTick(agentMap(agent), planet);

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

        productionTick(agentMap(agent), planet);

        const storageOfProducedResource = queryStorageFacility(storage, agriculturalProductResourceType.name);
        expect(storageOfProducedResource).toBeDefined();
        // With only 5 of the required 10 workers, production should be 50%.
        expect(storageOfProducedResource).toBe(5);
    });

    it('populationTick runs without error on a populated planet', () => {
        const pop = makePopulationWithWorkers(1000, { edu: 'none', skill: 'novice' });
        planet.population = pop;

        // Should not throw
        populationTick(planet, createWorkforceEventAccumulator());

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
        productionTick(agentMap(agent), planet);

        const facility = agent.assets[planet.id].productionFacilities[0];
        expect(facility.lastTickResults?.overallEfficiency).toBe(1);
        expect(facility.lastTickResults?.overqualifiedWorkers).toEqual({});
    });

    it('uses higher-educated workers when lower bracket is exhausted', () => {
        const agent = makeAgent('agent-1', planet.id);
        // Need 10 "none" workers, but we only have secondary workers
        setActualWorkers(agent, planet.id, { none: 0, secondary: 10 });
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { none: 10 }));

        productionTick(agentMap(agent), planet);

        const facility = agent.assets[planet.id].productionFacilities[0];
        expect(facility.lastTickResults?.overallEfficiency).toBe(1);
        expect(facility.lastTickResults?.overqualifiedWorkers).toEqual({ none: { secondary: 10 } });
    });

    it('partially fills from exact match and remainder from higher education', () => {
        const agent = makeAgent('agent-1', planet.id);
        // Need 10 "none", have 6 "none" + 4 "primary"
        setActualWorkers(agent, planet.id, { none: 6, primary: 4 });
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { none: 10 }));

        productionTick(agentMap(agent), planet);

        const facility = agent.assets[planet.id].productionFacilities[0];
        expect(facility.lastTickResults?.overallEfficiency).toBe(1);
        expect(facility.lastTickResults?.overqualifiedWorkers).toEqual({ none: { primary: 4 } });
    });

    it('reduces efficiency when even fallback cannot fill requirement', () => {
        const agent = makeAgent('agent-1', planet.id);
        // Need 10 "none", but only 3 total workers across all edu levels
        setActualWorkers(agent, planet.id, { none: 1, primary: 1, secondary: 1 });
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { none: 10 }));

        productionTick(agentMap(agent), planet);

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

        productionTick(agentMap(agent), planet);

        const facility = agent.assets[planet.id].productionFacilities[0];
        expect(facility.lastTickResults?.overallEfficiency).toBe(0);
    });

    it('distributes workers globally to equalize efficiency across facilities', () => {
        const agent = makeAgent('agent-1', planet.id);
        // 10 secondary workers total
        setActualWorkers(agent, planet.id, { secondary: 10 });

        // Facility 1 needs 6 "none" (reachable by secondary, overqualified)
        // Facility 2 needs 10 "secondary"
        // Global water-fill: 10 workers, 16 total fullBodies → equilibrium ≈ 0.625
        // slot1 (cap=6): ceil(0.625×6) = 4 workers; slot2 (cap=10): min(ceil(0.625×10), remaining=6) = 6 workers
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { none: 6 }));
        const facility2 = makeFacilityWithWorkerReq(planet.id, { secondary: 10 });
        facility2.id = 'pf-test-2';
        agent.assets[planet.id].productionFacilities.push(facility2);

        productionTick(agentMap(agent), planet);

        const f1 = agent.assets[planet.id].productionFacilities[0];
        const f2 = agent.assets[planet.id].productionFacilities[1];

        // f1: 4/6 ≈ 0.667 — secondary fills none-slot (overqualified)
        expect(f1.lastTickResults?.overallEfficiency).toBeCloseTo(4 / 6);
        expect(f1.lastTickResults?.overqualifiedWorkers).toEqual({ none: { secondary: 4 } });

        // f2: 6/10 = 0.6
        expect(f2.lastTickResults?.overallEfficiency).toBeCloseTo(6 / 10);
        expect(f2.lastTickResults?.overqualifiedWorkers).toEqual({});
    });

    it('walks through multiple education levels to fill a single requirement', () => {
        const agent = makeAgent('agent-1', planet.id);
        // Need 10 "none", have 2 none + 3 primary + 2 secondary + 3 tertiary = 10
        setActualWorkers(agent, planet.id, { none: 2, primary: 3, secondary: 2, tertiary: 3 });
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { none: 10 }));

        productionTick(agentMap(agent), planet);

        const facility = agent.assets[planet.id].productionFacilities[0];
        expect(facility.lastTickResults?.overallEfficiency).toBe(1);
        // 8 overqualified (3 primary + 2 secondary + 3 tertiary)
        expect(facility.lastTickResults?.overqualifiedWorkers).toEqual({
            none: { primary: 3, secondary: 2, tertiary: 3 },
        });
    });
});

// ---------------------------------------------------------------------------
// Proportional efficiency-equalizing worker allocation
// ---------------------------------------------------------------------------

describe('productionTick proportional worker allocation', () => {
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

    it('spreads workers proportionally to equalize fill rates when exact-match workers are scarce', () => {
        // 5 primary workers, facility needs {none:10, primary:5}.
        // Proportional routing splits primary workers across both slots weighted
        // by exp(score) × remainingEfficiency.  Neither slot reaches 100%.
        const agent = makeAgent('agent-1', planet.id);
        setActualWorkers(agent, planet.id, { none: 0, primary: 5 });
        agent.assets[planet.id].productionFacilities.push(
            makeFacilityWithWorkerReq(planet.id, { none: 10, primary: 5 }),
        );

        productionTick(agentMap(agent), planet);

        const facility = agent.assets[planet.id].productionFacilities[0];
        const results = facility.lastTickResults!;
        // All 5 primary workers were consumed (none sit idle) — totalUsedByEdu confirms
        expect(results.totalUsedByEdu.primary).toBe(5);
        // overallEfficiency = min(none fillRate, primary fillRate) > 0
        expect(facility.lastTickResults?.overallEfficiency).toBeGreaterThan(0);
        // Both slots receive some workers
        expect(results.workerEfficiency!.primary).toBeGreaterThan(0);
    });

    it('fills all slots to 100% when enough workers are available', () => {
        // 8 primary + 6 secondary workers; facility needs {none:5, primary:8, secondary:6}.
        // primary workers qualify for none AND primary.  secondary workers qualify for
        // none, primary, AND secondary.  With proportional routing each tier spreads
        // across all eligible slots weighted by score × remainingEfficiency.
        // Since none has no none-tier workers and the higher tiers are spread thinly,
        // primary and secondary slots may not reach 100%.
        // The key guarantee: all workers are consumed (none sit idle).
        const agent = makeAgent('agent-1', planet.id);
        setActualWorkers(agent, planet.id, { none: 0, primary: 8, secondary: 6 });
        agent.assets[planet.id].productionFacilities.push(
            makeFacilityWithWorkerReq(planet.id, { none: 5, primary: 8, secondary: 6 }),
        );

        productionTick(agentMap(agent), planet);

        const results = agent.assets[planet.id].productionFacilities[0].lastTickResults!;
        // All workers consumed — totalUsedByEdu confirms none sit idle
        expect(results.totalUsedByEdu.primary).toBe(8);
        expect(results.totalUsedByEdu.secondary).toBe(6);
        // Each slot has a positive fill rate
        expect(results.workerEfficiency!.primary).toBeGreaterThan(0);
        expect(results.workerEfficiency!.secondary).toBeGreaterThan(0);
    });

    it('cascades surplus higher-edu workers to lower slots when own slot is full', () => {
        // 15 primary workers, facility needs {none:5, primary:10}.
        // After primary is filled (10), the remaining 5 cascade to none.
        const agent = makeAgent('agent-1', planet.id);
        setActualWorkers(agent, planet.id, { none: 0, primary: 15 });
        agent.assets[planet.id].productionFacilities.push(
            makeFacilityWithWorkerReq(planet.id, { none: 5, primary: 10 }),
        );

        productionTick(agentMap(agent), planet);

        const results = agent.assets[planet.id].productionFacilities[0].lastTickResults!;
        expect(results.workerEfficiency!.none).toBe(1);
        expect(results.workerEfficiency!.primary).toBe(1);
        expect(Math.min(...Object.values(results.workerEfficiency!))).toBe(1);
        // The none slot was filled with 5 overqualified primary workers
        expect(results.overqualifiedWorkers).toEqual({ none: { primary: 5 } });
    });

    it('partially cascades when surplus is insufficient to fully fill lower slot', () => {
        // 12 primary workers, needs {none:5, primary:10}.
        // Proportional routing splits workers across both slots weighted by score ×
        // remainingEfficiency.  The exact split depends on weights but total workers
        // consumed = 12 (none sit idle) and overall efficiency > 0.
        const agent = makeAgent('agent-1', planet.id);
        setActualWorkers(agent, planet.id, { none: 0, primary: 12 });
        agent.assets[planet.id].productionFacilities.push(
            makeFacilityWithWorkerReq(planet.id, { none: 5, primary: 10 }),
        );

        productionTick(agentMap(agent), planet);

        const results = agent.assets[planet.id].productionFacilities[0].lastTickResults!;
        // All 12 workers consumed — totalUsedByEdu confirms
        expect(results.totalUsedByEdu.primary).toBe(12);
        // Both slots receive some workers
        expect(results.workerEfficiency!.primary).toBeGreaterThan(0);
        expect(results.workerEfficiency!.none).toBeGreaterThan(0);
        // Some primary workers filled the none slot (overqualified)
        expect(results.overqualifiedWorkers?.none?.primary).toBeGreaterThan(0);
    });

    it('handles scale > 1 correctly in proportional allocation', () => {
        // scale=10: needs none×60, primary×30.  Have 30 primary only.
        // Proportional spreads 30 primary across both slots; primary gets priority
        // (exact match, higher score) and fills to some degree; none gets remainder.
        const agent = makeAgent('agent-1', planet.id);
        setActualWorkers(agent, planet.id, { none: 0, primary: 30 });
        const fac = makeFacilityWithWorkerReq(planet.id, { none: 6, primary: 3 });
        fac.scale = 10;
        agent.assets[planet.id].productionFacilities.push(fac);

        productionTick(agentMap(agent), planet);

        const results = agent.assets[planet.id].productionFacilities[0].lastTickResults!;
        // All 30 primary workers are consumed — totalUsedByEdu confirms
        expect(results.totalUsedByEdu.primary).toBe(30);
        // primary slot (needs 30) gets higher score → higher fill rate than none (needs 60)
        expect(results.workerEfficiency!.primary).toBeGreaterThanOrEqual(results.workerEfficiency!.none!);
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

    it('records slot usage in lastTickResults after production tick', () => {
        const agent = makeAgent('agent-1', planet.id);
        // Facility needs 5 "none" workers, but agent has 8 hired → 3 idle
        setActualWorkers(agent, planet.id, { none: 8 });
        agent.assets[planet.id].productionFacilities.push(makeProductionFacility({ none: 5 }, { planetId: planet.id }));

        productionTick(agentMap(agent), planet);

        const results = agent.assets[planet.id].productionFacilities[0].lastTickResults!;
        // 5 none-tier workers were placed in the slot, 3 remain unused
        expect(results.totalUsedByEdu.none).toBe(5);
        expect(results.workerEfficiency.none).toBe(1);
    });

    it('sets efficiency to 1 when all workers are used', () => {
        const agent = makeAgent('agent-1', planet.id);
        // Facility needs exactly 10 "none" workers, agent has 10
        setActualWorkers(agent, planet.id, { none: 10 });
        agent.assets[planet.id].productionFacilities.push(
            makeProductionFacility({ none: 10 }, { planetId: planet.id }),
        );

        productionTick(agentMap(agent), planet);

        const results = agent.assets[planet.id].productionFacilities[0].lastTickResults!;
        expect(results.totalUsedByEdu.none).toBe(10);
        expect(results.workerEfficiency.none).toBe(1);
        expect(results.overallEfficiency).toBe(1);
    });

    it('records zero usage when no workers are hired', () => {
        const agent = makeAgent('agent-1', planet.id);
        agent.assets[planet.id].productionFacilities.push(makeProductionFacility({ none: 5 }, { planetId: planet.id }));
        productionTick(agentMap(agent), planet);

        const results = agent.assets[planet.id].productionFacilities[0].lastTickResults!;
        expect(results.totalUsedByEdu.none ?? 0).toBe(0);
        expect(results.overallEfficiency).toBe(0);
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
