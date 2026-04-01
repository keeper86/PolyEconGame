import { beforeEach, describe, expect, it } from 'vitest';
import { seedRng } from '../utils/stochasticRound';
import { productionTick } from './production';

import {
    agentMap,
    makeAgent,
    makePlanetWithPopulation,
    makeProductionFacility,
    makeStorageFacility,
} from '../utils/testHelper';
import { ironOreDepositResourceType } from './landBoundResources';
import type { GameState } from './planet';
import {
    agriculturalProductResourceType,
    ironOreResourceType,
    steelResourceType,
    vehicleResourceType,
    waterResourceType,
} from './resources';

// test helpers create fresh objects; no deep clone needed

describe('productionTick (basic)', () => {
    beforeEach(() => {
        // deterministic rounding
        seedRng(12345);
    });

    it('produces iron into storage when a matching worker is available', () => {
        // create minimal planet and agent via helpers
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        // create an iron extraction facility that needs an iron ore deposit and produces iron ore
        const facility = makeProductionFacility({ secondary: 1 }, { scale: 1 });
        facility.id = 'iron-extract';
        facility.needs = [{ resource: ironOreDepositResourceType, quantity: 1000 }];
        facility.produces = [{ resource: ironOreResourceType, quantity: 1000 }];

        // attach facility to agent and ensure workforce has one secondary worker
        agent.assets.p.productionFacilities = [facility];
        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.novice.active = 1;

        planet.resources[ironOreDepositResourceType.name] = [
            {
                id: 'iron-deposit-1',
                type: ironOreDepositResourceType,
                quantity: 5000,
                regenerationRate: 0,
                maximumCapacity: 5000,
                claimAgentId: gov.id,
                tenantAgentId: agent.id,
                tenantCostInCoins: 0,
            },
        ];

        const gameState: GameState = {
            tick: 0,
            planets: new Map([[planet.id, planet]]),
            agents: agentMap(agent, gov),
        };

        productionTick(gameState.agents, planet);

        const storedIron = agent.assets.p.storageFacility.currentInStorage['Iron Ore']?.quantity || 0;
        // ironExtractionFacility produces 1000 * scale(1) * overallEfficiency (should be 1)
        expect(storedIron).toBeGreaterThanOrEqual(1000);

        // Resource deposit should have been reduced by consumed amount (1000)
        const ironEntries = planet.resources['Iron Ore Deposit'];
        expect(ironEntries && ironEntries[0].quantity).toBeLessThan(5000);
    });

    it('does not operate facility when required land-bound resource is unavailable', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const facility = makeProductionFacility({ secondary: 1 }, { scale: 1 });
        facility.id = 'iron-extract';
        facility.needs = [{ resource: ironOreDepositResourceType, quantity: 1000 }];
        facility.produces = [{ resource: ironOreResourceType, quantity: 1000 }];

        agent.assets.p.productionFacilities = [facility];
        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.novice.active = 1;

        // create a depleted deposit (quantity 0) but tenanted by agent
        planet.resources[ironOreDepositResourceType.name] = [
            {
                id: 'iron-deposit-1',
                type: ironOreDepositResourceType,
                quantity: 0,
                regenerationRate: 0,
                maximumCapacity: 0,
                claimAgentId: gov.id,
                tenantAgentId: agent.id,
                tenantCostInCoins: 0,
            },
        ];

        const gameState: GameState = {
            tick: 0,
            planets: new Map([[planet.id, planet]]),
            agents: agentMap(agent, gov),
        };

        productionTick(gameState.agents, planet);
        const storedIron = agent.assets.p.storageFacility.currentInStorage['Iron Ore']?.quantity || 0;
        expect(storedIron).toBe(0);

        // The facility should have recorded 0% efficiency
        const recorded = agent.assets.p.productionFacilities.find((f) => f.id === 'iron-extract');
        expect(recorded).toBeDefined();
        expect(recorded!.lastTickResults?.overallEfficiency).toBe(0);
    });

    it('uses overqualified workers when lower-edu slots are empty', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        // facility needs 1 'none' worker but agent only has a primary worker
        const facility = makeProductionFacility({ none: 1 }, { scale: 1 });
        facility.id = 'oq-fac';
        facility.needs = [{ resource: ironOreDepositResourceType, quantity: 1 }];
        facility.produces = [{ resource: ironOreResourceType, quantity: 1 }];

        agent.assets.p.productionFacilities = [facility];
        const wf = agent.assets.p.workforceDemography;
        wf[30].primary.novice.active = 1; // overqualified

        // deposit available
        planet.resources[ironOreDepositResourceType.name] = [
            {
                id: 'd1',
                type: ironOreDepositResourceType,
                quantity: 10,
                regenerationRate: 0,
                maximumCapacity: 10,
                claimAgentId: gov.id,
                tenantAgentId: agent.id,
                tenantCostInCoins: 0,
            },
        ];

        const gs: GameState = { tick: 0, planets: new Map([[planet.id, planet]]), agents: agentMap(agent, gov) };
        productionTick(gs.agents, planet);

        // facility should record overqualified usage for jobEdu 'none'
        const recorded = agent.assets.p.productionFacilities.find((f) => f.id === 'oq-fac');
        expect(recorded).toBeDefined();
        const oq = recorded!.lastTickResults?.overqualifiedWorkers;
        expect(oq).toBeDefined();
        expect(oq!.none && oq!.none!.primary).toBeGreaterThanOrEqual(1);
    });

    it('scales production down when one input resource is scarce', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const facility = makeProductionFacility({ secondary: 1 }, { scale: 1 });
        facility.id = 'scale-fac';
        // two needs: one abundant, one scarce
        const resA = ironOreDepositResourceType;
        const resB = { ...ironOreDepositResourceType, name: 'Other Deposit' };
        facility.needs = [
            { resource: resA, quantity: 1000 },
            { resource: resB, quantity: 1000 },
        ];
        facility.produces = [{ resource: ironOreResourceType, quantity: 1000 }];

        agent.assets.p.productionFacilities = [facility];
        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.novice.active = 1;

        // resA abundant, resB scarce (only 100 available)
        planet.resources[resA.name] = [
            {
                id: 'a1',
                type: resA,
                quantity: 10000,
                regenerationRate: 0,
                maximumCapacity: 10000,
                claimAgentId: gov.id,
                tenantAgentId: agent.id,
                tenantCostInCoins: 0,
            },
        ];
        planet.resources[resB.name] = [
            {
                id: 'b1',
                type: resB,
                quantity: 100,
                regenerationRate: 0,
                maximumCapacity: 100,
                claimAgentId: gov.id,
                tenantAgentId: agent.id,
                tenantCostInCoins: 0,
            },
        ];

        const gs: GameState = { tick: 0, planets: new Map([[planet.id, planet]]), agents: agentMap(agent, gov) };
        productionTick(gs.agents, planet);

        const recorded = agent.assets.p.productionFacilities.find((f) => f.id === 'scale-fac');
        expect(recorded).toBeDefined();
        const overall = recorded!.lastTickResults?.overallEfficiency ?? 0;
        expect(overall).toBeGreaterThan(0);
        expect(overall).toBeLessThan(1);
        // produced amount should be scaled down accordingly
        const stored = agent.assets.p.storageFacility.currentInStorage['Iron Ore']?.quantity ?? 0;
        expect(stored).toBeLessThan(1000);
    });

    it('records unused workers via lastTickResults.totalUsedByEdu', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const facility = makeProductionFacility({ secondary: 1 }, { scale: 1 });
        facility.id = 'u-fac';
        facility.needs = [{ resource: ironOreDepositResourceType, quantity: 1 }];
        facility.produces = [{ resource: ironOreResourceType, quantity: 1 }];

        agent.assets.p.productionFacilities = [facility];
        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.novice.active = 2; // one extra worker

        planet.resources[ironOreDepositResourceType.name] = [
            {
                id: 'd1',
                type: ironOreDepositResourceType,
                quantity: 10,
                regenerationRate: 0,
                maximumCapacity: 10,
                claimAgentId: gov.id,
                tenantAgentId: agent.id,
                tenantCostInCoins: 0,
            },
        ];

        const gs: GameState = { tick: 0, planets: new Map([[planet.id, planet]]), agents: agentMap(agent, gov) };
        productionTick(gs.agents, planet);

        // Only 1 slot needed — totalUsedByEdu.secondary should be ≤ 1 (the slot capacity)
        const used = facility.lastTickResults?.totalUsedByEdu?.secondary ?? 0;
        expect(used).toBeLessThanOrEqual(1);
        // Efficiency should still be 1 (slot was filled)
        expect(facility.lastTickResults?.overallEfficiency).toBe(1);
    });
});

describe('productionTick — shared stored-resource allocation', () => {
    beforeEach(() => {
        seedRng(42);
    });

    it('splits scarce stored input proportionally across two facilities sharing the same storage', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('company');

        // facility A: needs 800 water, produces beverages  (scale 400 → needs 320 000 water at full)
        const facilityA = makeProductionFacility({ none: 1 }, { id: 'fac-a', scale: 400 });
        facilityA.needs = [{ resource: waterResourceType, quantity: 800 }];
        facilityA.produces = [{ resource: agriculturalProductResourceType, quantity: 1000 }];

        // facility B: needs 500 water, produces something else  (scale 800 → needs 400 000 water at full)
        const facilityB = makeProductionFacility({ none: 1 }, { id: 'fac-b', scale: 800 });
        facilityB.needs = [{ resource: waterResourceType, quantity: 500 }];
        facilityB.produces = [{ resource: ironOreResourceType, quantity: 1000 }];

        // give each facility one worker so efficiency is not zero
        const wf = agent.assets.p.workforceDemography;
        wf[30].none.novice.active = 2;

        // stock the shared storage with a small amount of water — less than either facility needs alone
        agent.assets.p.storageFacility.currentInStorage[waterResourceType.name] = {
            resource: waterResourceType,
            quantity: 720,
        };
        agent.assets.p.storageFacility.current.volume = 720 * waterResourceType.volumePerQuantity;
        agent.assets.p.storageFacility.current.mass = 720 * waterResourceType.massPerQuantity;

        agent.assets.p.productionFacilities = [facilityA, facilityB];

        const gs: GameState = { tick: 0, planets: new Map([[planet.id, planet]]), agents: agentMap(agent, gov) };
        productionTick(gs.agents, planet);

        // Both facilities must have run (efficiency > 0)
        expect(facilityA.lastTickResults.overallEfficiency).toBeGreaterThan(0);
        expect(facilityB.lastTickResults.overallEfficiency).toBeGreaterThan(0);

        // No water should remain (all consumed, within rounding tolerance)
        const remaining = agent.assets.p.storageFacility.currentInStorage[waterResourceType.name]?.quantity ?? 0;
        expect(remaining).toBeLessThanOrEqual(1);

        // Both facilities must have equal water efficiency — proportional allocation means
        // available / totalDemand is the same for each.
        expect(facilityA.lastTickResults.resourceEfficiency[waterResourceType.name]).toBeCloseTo(
            facilityB.lastTickResults.resourceEfficiency[waterResourceType.name]!,
            5,
        );
    });

    it('does not over-draw storage when two facilities compete for the same stored resource', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('company');

        const facilityA = makeProductionFacility({ none: 1 }, { id: 'fac-a', scale: 100 });
        facilityA.needs = [{ resource: waterResourceType, quantity: 100 }];
        facilityA.produces = [{ resource: agriculturalProductResourceType, quantity: 100 }];

        const facilityB = makeProductionFacility({ none: 1 }, { id: 'fac-b', scale: 100 });
        facilityB.needs = [{ resource: waterResourceType, quantity: 100 }];
        facilityB.produces = [{ resource: ironOreResourceType, quantity: 100 }];

        const wf = agent.assets.p.workforceDemography;
        wf[30].none.novice.active = 2;

        const initialWater = 500;
        agent.assets.p.storageFacility.currentInStorage[waterResourceType.name] = {
            resource: waterResourceType,
            quantity: initialWater,
        };
        agent.assets.p.storageFacility.current.volume = initialWater * waterResourceType.volumePerQuantity;
        agent.assets.p.storageFacility.current.mass = initialWater * waterResourceType.massPerQuantity;

        agent.assets.p.productionFacilities = [facilityA, facilityB];

        const gs: GameState = { tick: 0, planets: new Map([[planet.id, planet]]), agents: agentMap(agent, gov) };
        productionTick(gs.agents, planet);

        const remaining = agent.assets.p.storageFacility.currentInStorage[waterResourceType.name]?.quantity ?? 0;
        expect(remaining).toBeGreaterThanOrEqual(0);
        // Total consumed must not exceed what was available
        expect(remaining).toBeLessThanOrEqual(initialWater);
    });
});

describe('productionTick — pieces vs continuous resource handling', () => {
    beforeEach(() => {
        seedRng(12345);
    });

    it('keeps produced quantity as float for a continuous (solid) resource', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('company');

        const facility = makeProductionFacility({ none: 1 }, { scale: 1 });
        facility.id = 'water-fac';
        facility.needs = [{ resource: ironOreDepositResourceType, quantity: 1 }];
        facility.produces = [{ resource: waterResourceType, quantity: 7 }];

        planet.resources[ironOreDepositResourceType.name] = [
            {
                id: 'd1',
                type: ironOreDepositResourceType,
                quantity: 100,
                regenerationRate: 0,
                maximumCapacity: 100,
                claimAgentId: gov.id,
                tenantAgentId: agent.id,
                tenantCostInCoins: 0,
            },
        ];

        const wf = agent.assets.p.workforceDemography;
        wf[30].none.novice.active = 1;
        agent.assets.p.productionFacilities = [facility];
        agent.assets.p.storageFacility = makeStorageFacility({ planetId: 'p', capacity: { volume: 1e12, mass: 1e12 } });

        productionTick(agentMap(agent, gov), planet);

        const produced = facility.lastTickResults.lastProduced[waterResourceType.name] ?? 0;
        expect(produced).toBe(7);
    });

    it('produces integer quantity for a pieces resource', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('company');

        agent.assets.p.storageFacility = makeStorageFacility({
            planetId: 'p',
            capacity: { volume: 1e12, mass: 1e12 },
            currentInStorage: { [steelResourceType.name]: { resource: steelResourceType, quantity: 1000 } },
            current: {
                volume: 1000 * steelResourceType.volumePerQuantity,
                mass: 1000 * steelResourceType.massPerQuantity,
            },
        });

        const facility = makeProductionFacility({ none: 1 }, { scale: 1 });
        facility.id = 'vehicle-fac';
        facility.needs = [{ resource: steelResourceType, quantity: 10 }];
        facility.produces = [{ resource: vehicleResourceType, quantity: 3 }];

        const wf = agent.assets.p.workforceDemography;
        wf[30].none.novice.active = 1;
        agent.assets.p.productionFacilities = [facility];

        const gs: GameState = { tick: 0, planets: new Map([['p', planet]]), agents: agentMap(agent, gov) };
        productionTick(gs.agents, planet);

        const produced = facility.lastTickResults.lastProduced[vehicleResourceType.name] ?? 0;
        expect(Number.isInteger(produced)).toBe(true);
    });

    it('consumes float quantity for a continuous resource at partial efficiency', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('company');

        const availableWater = 5.7;
        agent.assets.p.storageFacility = makeStorageFacility({
            planetId: 'p',
            capacity: { volume: 1e12, mass: 1e12 },
            currentInStorage: {
                [waterResourceType.name]: { resource: waterResourceType, quantity: availableWater },
            },
            current: {
                volume: availableWater * waterResourceType.volumePerQuantity,
                mass: availableWater * waterResourceType.massPerQuantity,
            },
        });

        const facility = makeProductionFacility({ none: 1 }, { scale: 1 });
        facility.id = 'water-consumer';
        facility.needs = [{ resource: waterResourceType, quantity: 10 }];
        facility.produces = [{ resource: agriculturalProductResourceType, quantity: 5 }];

        const wf = agent.assets.p.workforceDemography;
        wf[30].none.novice.active = 1;
        agent.assets.p.productionFacilities = [facility];

        const gs: GameState = { tick: 0, planets: new Map([['p', planet]]), agents: agentMap(agent, gov) };
        productionTick(gs.agents, planet);

        const consumed = facility.lastTickResults.lastConsumed[waterResourceType.name] ?? 0;
        expect(consumed).toBeCloseTo(availableWater, 9);
        expect(Number.isInteger(consumed)).toBe(false);
    });
});
