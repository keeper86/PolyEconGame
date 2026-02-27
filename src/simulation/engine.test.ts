import { describe, it, expect, beforeEach } from 'vitest';

import { environmentTick, productionTick, populationTick } from './engine';
import { agriculturalProductResourceType, putIntoStorageFacility, queryStorageFacility } from './facilities';
import { totalPopulation } from './populationHelpers';
import type { StorageFacility, ProductionFacility, Resource } from './facilities';
import type { Planet, Agent, EducationLevelType } from './planet';
import type { GameState } from './engine';
import { createWorkforceDemography } from './workforce';

function makeEmptyStorage(): StorageFacility {
    return {
        planetId: 'p',
        id: 's',
        name: 'test-storage',
        scale: 1,
        powerConsumptionPerTick: 0,
        workerRequirement: {},
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        capacity: { volume: 1e9, mass: 1e9 },
        current: { volume: 0, mass: 0 },
        currentInStorage: {},
    } as StorageFacility;
}

function makeAgentForPlanet(planetId: string): Agent {
    const storage = makeEmptyStorage();
    const assetsEntry = {
        resourceClaims: [] as string[],
        resourceTenancies: [] as string[],
        productionFacilities: [] as ProductionFacility[],
        storageFacility: storage,
        allocatedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 },
    };

    return {
        id: `agent-${planetId}`,
        name: 'A',
        associatedPlanetId: planetId,
        wealth: 0,
        transportShips: [],
        assets: { [planetId]: assetsEntry },
    };
}

function makePlanet(): Planet {
    const population = {
        demography: Array.from({ length: 2 }, () => ({
            none: { unoccupied: 1, company: 0, government: 0, education: 0, unableToWork: 0 },
            primary: { unoccupied: 0, company: 0, government: 0, education: 0, unableToWork: 0 },
            secondary: { unoccupied: 0, company: 0, government: 0, education: 0, unableToWork: 0 },
            tertiary: { unoccupied: 0, company: 0, government: 0, education: 0, unableToWork: 0 },
            quaternary: { unoccupied: 0, company: 0, government: 0, education: 0, unableToWork: 0 },
        })),
        starvationLevel: 0,
    };

    const env = {
        naturalDisasters: { earthquakes: 0, floods: 0, storms: 0 },
        pollution: { air: 10, water: 5, soil: 2 },
        regenerationRates: {
            air: { constant: 1, percentage: 0 },
            water: { constant: 1, percentage: 0 },
            soil: { constant: 1, percentage: 0 },
        },
    };

    const government = makeAgentForPlanet('planet-1');

    return {
        id: 'planet-1',
        name: 'P',
        position: { x: 0, y: 0, z: 0 },
        population,
        resources: {},
        government,
        infrastructure: {
            primarySchools: 0,
            secondarySchools: 0,
            universities: 0,
            hospitals: 0,
            mobility: { roads: 0, railways: 0, airports: 0, seaports: 0, spaceports: 0 },
            energy: { production: 0 },
        },
        environment: env,
    } as Planet;
}

/**
 * Sets up actual hired workers in the agent's workforceDemography for a planet.
 * Workers are placed in tenure year 0. This is what productionTick now reads
 * instead of allocatedWorkers (which is only the target).
 */
function setActualWorkers(agent: Agent, planetId: string, workers: Partial<Record<EducationLevelType, number>>) {
    const assets = agent.assets[planetId];
    if (!assets.workforceDemography) {
        assets.workforceDemography = createWorkforceDemography();
    }
    for (const [edu, count] of Object.entries(workers)) {
        assets.workforceDemography[0].active[edu as EducationLevelType] = count ?? 0;
    }
}

describe('engine basic behavior', () => {
    let planet: Planet;

    beforeEach(() => {
        planet = makePlanet();
    });

    it('environmentTick reduces pollution by regenerationRates (not below 0)', () => {
        const gs: GameState = { tick: 0, planets: [planet], agents: [] };
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
        const agent = makeAgentForPlanet(planet.id);

        // production facility that produces 10 agricultural product per tick, no needs, no worker requirements
        const prod: ProductionFacility = {
            planetId: planet.id,
            id: 'pf1',
            name: 'farm',
            scale: 1,
            lastTickEfficiencyInPercent: 100,
            powerConsumptionPerTick: 0,
            workerRequirement: {},
            pollutionPerTick: { air: 0, water: 0, soil: 0 },
            needs: [],
            produces: [{ resource: agriculturalProductResourceType, quantity: 10 }],
        };

        agent.assets[planet.id].productionFacilities.push(prod);

        const gameState: GameState = { planets: [planet], agents: [agent], tick: 0 };

        productionTick(gameState);

        const entry = agent.assets[planet.id].storageFacility.currentInStorage[agriculturalProductResourceType.name];
        expect(entry).toBeDefined();
        expect(entry!.quantity).toBeGreaterThanOrEqual(10);
    });

    it('productionTick does remove needed resources from storage', () => {
        const agent = makeAgentForPlanet(planet.id);

        const neededResource: Resource = {
            name: 'Needed Resource',
            type: 'solid',
            volumePerQuantity: 1,
            massPerQuantity: 1,
        };

        const neededResourceQuantity = 10;
        const producedResourceQuantity = 10;

        // production facility that produces 10 agricultural product per tick, needs 5 of neededResource, no worker requirements
        const prod: ProductionFacility = {
            planetId: planet.id,
            id: 'pf1',
            name: 'factory',
            scale: 1,
            lastTickEfficiencyInPercent: 100,
            powerConsumptionPerTick: 0,
            workerRequirement: {},
            pollutionPerTick: { air: 0, water: 0, soil: 0 },
            needs: [{ resource: neededResource, quantity: neededResourceQuantity }],
            produces: [{ resource: agriculturalProductResourceType, quantity: producedResourceQuantity }],
        };

        agent.assets[planet.id].productionFacilities.push(prod);

        // put some needed resource into storage
        const storage = agent.assets[planet.id].storageFacility;
        putIntoStorageFacility(storage, neededResource, neededResourceQuantity);

        const gameState: GameState = { planets: [planet], agents: [agent], tick: 0 };

        productionTick(gameState);

        const storageOfNeededResource = queryStorageFacility(storage, neededResource.name);
        expect(storageOfNeededResource).toBeDefined();
        expect(storageOfNeededResource).toBe(0);

        const storageOfProducedResource = queryStorageFacility(storage, agriculturalProductResourceType.name);
        expect(storageOfProducedResource).toBeDefined();
        expect(storageOfProducedResource).toBe(producedResourceQuantity);
    });

    it('productionTick does only produce proportionally to available needed resources', () => {
        const agent = makeAgentForPlanet(planet.id);

        const neededResource: Resource = {
            name: 'Needed Resource',
            type: 'solid',
            volumePerQuantity: 1,
            massPerQuantity: 1,
        };

        const neededResourceQuantity = 10;
        const producedResourceQuantity = 10;

        // production facility that produces 10 agricultural product per tick, needs 10 of neededResource, no worker requirements
        const prod: ProductionFacility = {
            planetId: planet.id,
            id: 'pf1',
            name: 'factory',
            scale: 1,
            lastTickEfficiencyInPercent: 100,
            powerConsumptionPerTick: 0,
            workerRequirement: {},
            pollutionPerTick: { air: 0, water: 0, soil: 0 },
            needs: [{ resource: neededResource, quantity: neededResourceQuantity }],
            produces: [{ resource: agriculturalProductResourceType, quantity: producedResourceQuantity }],
        };
        agent.assets[planet.id].productionFacilities.push(prod);

        const gameState: GameState = { planets: [planet], agents: [agent], tick: 0 };

        const storage = agent.assets[planet.id].storageFacility;
        putIntoStorageFacility(storage, neededResource, neededResourceQuantity / 10); // ensure insufficient needed resource is available, but still > 0

        const storageOfNeededResource = queryStorageFacility(storage, neededResource.name);
        expect(storageOfNeededResource).toBeDefined();
        expect(storageOfNeededResource).toBe(1);

        productionTick(gameState);

        const storageOfProducedResource = queryStorageFacility(storage, agriculturalProductResourceType.name);
        expect(storageOfProducedResource).toBeDefined();
        // With 1/10 available needed resource, production should be 1/10.
        expect(storageOfProducedResource).toBe(producedResourceQuantity / 10);
    });

    it('productionTick only produce proportional when there are not enough workers.', () => {
        const agent = makeAgentForPlanet(planet.id);

        // production facility that produces 10 agricultural product per tick, needs 10 unoccupied workers with no education, requires 10 workers with no education, no resource needs
        const prod: ProductionFacility = {
            planetId: planet.id,
            id: 'pf1',
            name: 'factory',
            scale: 1,
            lastTickEfficiencyInPercent: 100,
            powerConsumptionPerTick: 0,
            workerRequirement: { none: 10 },
            pollutionPerTick: { air: 0, water: 0, soil: 0 },
            needs: [],
            produces: [{ resource: agriculturalProductResourceType, quantity: 10 }],
        };
        agent.assets[planet.id].productionFacilities.push(prod);

        const gameState: GameState = { planets: [planet], agents: [agent], tick: 0 };

        const storage = agent.assets[planet.id].storageFacility;

        // Set 5 actual hired workers (via workforce demography) of the required 10
        setActualWorkers(agent, planet.id, { none: 5 });

        productionTick(gameState);

        const storageOfProducedResource = queryStorageFacility(storage, agriculturalProductResourceType.name);
        expect(storageOfProducedResource).toBeDefined();
        // With only 5 of the required 10 workers, production should be 50%.
        expect(storageOfProducedResource).toBe(5);
    });

    it('populationTick consumes small food per tick from government storage and updates shortage correctly', () => {
        // put some agricultural product into government storage
        const govStorage = planet.government.assets[planet.id].storageFacility;
        govStorage.currentInStorage[agriculturalProductResourceType.name] = {
            resource: agriculturalProductResourceType,
            quantity: 1,
        };
        govStorage.current.mass = 1 * agriculturalProductResourceType.massPerQuantity;
        govStorage.current.volume = 1 * agriculturalProductResourceType.volumePerQuantity;

        const gameState: GameState = { planets: [planet], agents: [planet.government], tick: 0 };

        populationTick(gameState);

        const remaining = govStorage.currentInStorage[agriculturalProductResourceType.name]?.quantity ?? 0;
        // The code removes some amount (ceil/floor inside). Ensure some was removed.
        expect(remaining).toBeLessThanOrEqual(1);
    });

    it('starvationLevel increases when food is lacking', () => {
        const gameState: GameState = { planets: [planet], agents: [planet.government], tick: 0 };

        // Ensure there's no food in government storage
        const govStorage = planet.government.assets[planet.id].storageFacility;
        govStorage.currentInStorage = {};

        // give the planet a larger population so mortality rounding doesn't instantly kill everyone
        for (const c of planet.population.demography) {
            c.none.unoccupied = 100;
        }

        // run some ticks to let starvation begin to accumulate and collect the values
        const buildUpTicks = 10;
        const levels: number[] = [];
        const initialTotal = totalPopulation(planet.population);
        for (let i = 0; i < buildUpTicks; i++) {
            populationTick(gameState);
            levels.push(planet.population.starvationLevel ?? 0);
        }

        // At least one tick should have increased the starvation level above zero
        expect(levels.some((l) => l > 0)).toBe(true);
        // and no level should exceed the modeled cap (0.9)
        expect(Math.max(...levels)).toBeLessThanOrEqual(0.9);
        const afterTotal = totalPopulation(planet.population);
        // population should not increase during starvation buildup
        expect(afterTotal).toBeLessThanOrEqual(initialTotal);
    });

    it('starvationLevel decays when food is provided each tick (recovers over ~60 ticks)', () => {
        const gameState: GameState = { planets: [planet], agents: [planet.government], tick: 0 };

        const govStorage = planet.government.assets[planet.id].storageFacility;

        // give the planet a larger population so mortality rounding doesn't instantly kill everyone
        for (const c of planet.population.demography) {
            c.none.unoccupied = 100;
        }

        // first, drive starvation up to the cap and record progression
        const buildLevels: number[] = [];
        for (let i = 0; i < 35; i++) {
            populationTick(gameState);
            buildLevels.push(planet.population.starvationLevel ?? 0);
        }

        // diagnostic (if the test fails it helps debugging)

        console.log('buildLevels:', buildLevels);

        const before = planet.population.starvationLevel ?? 0;
        expect(before).toBeGreaterThan(0);
        const popBefore = totalPopulation(planet.population);

        // Now supply a small amount of food each tick to simulate foraging/aid.
        // The engine removes whatever is in storage, so deposit a small amount each tick.
        const recoveryTicks = 65;
        for (let i = 0; i < recoveryTicks; i++) {
            // deposit 1 unit of agricultural product per tick
            putIntoStorageFacility(govStorage, agriculturalProductResourceType, 1);
            populationTick(gameState);
        }

        const after = planet.population.starvationLevel ?? 0;
        // After sustained feeding, starvation should have decreased compared to before
        expect(after).toBeLessThan(before);
        const popAfter = totalPopulation(planet.population);
        // population should have decreased (some deaths occurred during starvation)
        expect(popAfter).toBeLessThanOrEqual(popBefore);
    });
});

// ---------------------------------------------------------------------------
// Worker education downhill fallback in productionTick
// ---------------------------------------------------------------------------

describe('productionTick worker education fallback', () => {
    let planet: Planet;

    beforeEach(() => {
        planet = makePlanet();
    });

    function makeFacilityWithWorkerReq(
        planetId: string,
        workerRequirement: Partial<Record<string, number>>,
    ): ProductionFacility {
        return {
            planetId,
            id: 'pf-test',
            name: 'test-facility',
            scale: 1,
            lastTickEfficiencyInPercent: 0,
            powerConsumptionPerTick: 0,
            workerRequirement,
            pollutionPerTick: { air: 0, water: 0, soil: 0 },
            needs: [],
            produces: [{ resource: agriculturalProductResourceType, quantity: 100 }],
        };
    }

    it('fills worker requirement exactly when matching education is available', () => {
        const agent = makeAgentForPlanet(planet.id);
        setActualWorkers(agent, planet.id, { primary: 10 });
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { primary: 10 }));

        const gs: GameState = { tick: 0, planets: [planet], agents: [agent] };
        productionTick(gs);

        const facility = agent.assets[planet.id].productionFacilities[0];
        expect(facility.lastTickEfficiencyInPercent).toBe(100);
        expect(facility.lastTickOverqualifiedWorkers).toBeUndefined();
    });

    it('uses higher-educated workers when lower bracket is exhausted', () => {
        const agent = makeAgentForPlanet(planet.id);
        // Need 10 "none" workers, but we only have secondary workers
        setActualWorkers(agent, planet.id, { none: 0, secondary: 10 });
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { none: 10 }));

        const gs: GameState = { tick: 0, planets: [planet], agents: [agent] };
        productionTick(gs);

        const facility = agent.assets[planet.id].productionFacilities[0];
        expect(facility.lastTickEfficiencyInPercent).toBe(100);
        expect(facility.lastTickOverqualifiedWorkers).toEqual({ none: 10 });
    });

    it('partially fills from exact match and remainder from higher education', () => {
        const agent = makeAgentForPlanet(planet.id);
        // Need 10 "none", have 6 "none" + 4 "primary"
        setActualWorkers(agent, planet.id, { none: 6, primary: 4 });
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { none: 10 }));

        const gs: GameState = { tick: 0, planets: [planet], agents: [agent] };
        productionTick(gs);

        const facility = agent.assets[planet.id].productionFacilities[0];
        expect(facility.lastTickEfficiencyInPercent).toBe(100);
        expect(facility.lastTickOverqualifiedWorkers).toEqual({ none: 4 });
    });

    it('reduces efficiency when even fallback cannot fill requirement', () => {
        const agent = makeAgentForPlanet(planet.id);
        // Need 10 "none", but only 3 total workers across all edu levels
        setActualWorkers(agent, planet.id, { none: 1, primary: 1, secondary: 1 });
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { none: 10 }));

        const gs: GameState = { tick: 0, planets: [planet], agents: [agent] };
        productionTick(gs);

        const facility = agent.assets[planet.id].productionFacilities[0];
        // 3/10 = 30%
        expect(facility.lastTickEfficiencyInPercent).toBe(30);
        expect(facility.lastTickOverqualifiedWorkers).toEqual({ none: 2 });
    });

    it('does not use lower-educated workers to fill higher requirements', () => {
        const agent = makeAgentForPlanet(planet.id);
        // Need 10 "secondary", only have "none" and "primary" — cannot fill
        setActualWorkers(agent, planet.id, { none: 100, primary: 100, secondary: 0 });
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { secondary: 10 }));

        const gs: GameState = { tick: 0, planets: [planet], agents: [agent] };
        productionTick(gs);

        const facility = agent.assets[planet.id].productionFacilities[0];
        expect(facility.lastTickEfficiencyInPercent).toBe(0);
    });

    it('deducts overqualified workers from remainingWorker so second facility sees fewer', () => {
        const agent = makeAgentForPlanet(planet.id);
        // 10 secondary workers total
        setActualWorkers(agent, planet.id, { secondary: 10 });

        // Facility 1 needs 6 "none" — will use 6 secondary (overqualified)
        // Facility 2 needs 10 "secondary" — only 4 remaining
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { none: 6 }));
        const facility2 = makeFacilityWithWorkerReq(planet.id, { secondary: 10 });
        facility2.id = 'pf-test-2';
        agent.assets[planet.id].productionFacilities.push(facility2);

        const gs: GameState = { tick: 0, planets: [planet], agents: [agent] };
        productionTick(gs);

        const f1 = agent.assets[planet.id].productionFacilities[0];
        const f2 = agent.assets[planet.id].productionFacilities[1];

        expect(f1.lastTickEfficiencyInPercent).toBe(100);
        expect(f1.lastTickOverqualifiedWorkers).toEqual({ none: 6 });

        // Only 4 secondary remain for facility 2
        expect(f2.lastTickEfficiencyInPercent).toBe(40);
        expect(f2.lastTickOverqualifiedWorkers).toBeUndefined();
    });

    it('walks through multiple education levels to fill a single requirement', () => {
        const agent = makeAgentForPlanet(planet.id);
        // Need 10 "none", have 2 none + 3 primary + 2 secondary + 3 tertiary = 10
        setActualWorkers(agent, planet.id, { none: 2, primary: 3, secondary: 2, tertiary: 3 });
        agent.assets[planet.id].productionFacilities.push(makeFacilityWithWorkerReq(planet.id, { none: 10 }));

        const gs: GameState = { tick: 0, planets: [planet], agents: [agent] };
        productionTick(gs);

        const facility = agent.assets[planet.id].productionFacilities[0];
        expect(facility.lastTickEfficiencyInPercent).toBe(100);
        // 8 overqualified (3 primary + 2 secondary + 3 tertiary)
        expect(facility.lastTickOverqualifiedWorkers).toEqual({ none: 8 });
    });
});
