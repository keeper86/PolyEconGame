import { beforeEach, describe, expect, it } from 'vitest';
import { seedRng } from '../utils/stochasticRound';
import { MIN_SCALE_FRACTION } from './automaticProductionScale/constants';
import { queryStorageFacility } from './facility';
import { computeStorageSpaceFactor, constructionTick, productionTick } from './production';

import { makePool } from '../initialUniverse/resourceClaimFactory';
import type { TransportShipType } from '../ships/ships';
import {
    makeAgent,
    makeGameState,
    makeHRFacility,
    makeManagementFacility,
    makePlanetWithPopulation,
    makeProductionFacility,
    makeShipConstructionFacility,
    makeStorageFacility,
    setStorageResourceQuantity,
} from '../utils/testHelper';
import { authorShellCompartments } from './automaticProductionScale/shellCompartments';
import { ironOreDepositResourceType } from './landBoundResources';
import type { AgentPlanetAssets } from './planet';
import {
    ironOreResourceType,
    plasticResourceType,
    produceResourceType,
    steelResourceType,
    waterResourceType,
} from './resources';
import {
    administrativeServiceResourceType,
    constructionServiceResourceType,
    humanResourcesServiceResourceType,
    maintenanceServiceResourceType,
} from './services';

// The auto-granted storage shells are now operational facilities that also hire. Zero their
// requirements so worker-allocation tests exercise a single facility with a controlled workforce.
function quietStorageShells(agent: ReturnType<typeof makeAgent>): void {
    for (const shell of Object.values(agent.assets.p.storage.shells)) {
        shell.workerRequirement = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    }
}

describe('productionTick (basic)', () => {
    beforeEach(() => {
        seedRng(12345);
    });

    it('produces iron into storage when a matching worker is available', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const facility = makeProductionFacility({ secondary: 1 }, { scale: 1 });
        facility.id = 'iron-extract';
        facility.needs = [{ resource: ironOreDepositResourceType, quantity: 1000 }];
        facility.produces = [{ resource: ironOreResourceType, quantity: 1000 }];

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.active = 1;

        planet.resources[ironOreDepositResourceType.name] = {
            pool: makePool({ type: ironOreDepositResourceType, quantity: 0, renewable: false }),
            claims: [
                {
                    id: 'iron-deposit-1',
                    resource: ironOreDepositResourceType,
                    quantity: 5000,
                    regenerationRate: 0,
                    maximumCapacity: 5000,
                    tenantAgentId: agent.id,
                    tenantCostInCoins: 0,
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };

        const gameState = makeGameState(planet, [agent, gov]);

        productionTick(gameState, planet);

        const storedIron = queryStorageFacility(agent.assets.p.storage, 'Iron Ore');

        expect(storedIron).toBeGreaterThanOrEqual(1000);

        const ironEntries = planet.resources['Iron Ore Deposit'];
        expect(ironEntries?.claims[0]?.quantity).toBeLessThan(5000);
    });

    it('does not operate facility when required land-bound resource is unavailable', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const facility = makeProductionFacility({ secondary: 1 }, { scale: 1 });
        facility.id = 'iron-extract';
        facility.needs = [{ resource: ironOreDepositResourceType, quantity: 1000 }];
        facility.produces = [{ resource: ironOreResourceType, quantity: 1000 }];

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.active = 1;

        planet.resources[ironOreDepositResourceType.name] = {
            pool: makePool({ type: ironOreDepositResourceType, quantity: 0, renewable: false }),
            claims: [
                {
                    id: 'iron-deposit-1',
                    resource: ironOreDepositResourceType,
                    quantity: 0,
                    regenerationRate: 0,
                    maximumCapacity: 0,
                    tenantAgentId: agent.id,
                    tenantCostInCoins: 0,
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };

        const gameState = makeGameState(planet, [agent, gov]);

        productionTick(gameState, planet);
        const storedIron = queryStorageFacility(agent.assets.p.storage, 'Iron Ore');
        expect(storedIron).toBe(0);

        const recorded = agent.assets.p.productionFacilities.find((f) => f.id === 'iron-extract');
        expect(recorded).toBeDefined();
        expect(recorded!.lastTickResults?.overallEfficiency).toBe(0);
    });

    it('uses overqualified workers when lower-edu slots are empty', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const facility = makeProductionFacility({ none: 1 }, { scale: 1 });
        facility.id = 'oq-fac';
        facility.needs = [{ resource: ironOreDepositResourceType, quantity: 1 }];
        facility.produces = [{ resource: ironOreResourceType, quantity: 1 }];

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        const wf = agent.assets.p.workforceDemography;
        wf[30].primary.active = 1;

        planet.resources[ironOreDepositResourceType.name] = {
            pool: makePool({ type: ironOreDepositResourceType, quantity: 0, renewable: false }),
            claims: [
                {
                    id: 'd1',
                    resource: ironOreDepositResourceType,
                    quantity: 10,
                    regenerationRate: 0,
                    maximumCapacity: 10,
                    tenantAgentId: agent.id,
                    tenantCostInCoins: 0,
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

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

        const resA = ironOreDepositResourceType;
        const resB = { ...ironOreDepositResourceType, name: 'Other Deposit' };
        facility.needs = [
            { resource: resA, quantity: 1000 },
            { resource: resB, quantity: 1000 },
        ];
        facility.produces = [{ resource: ironOreResourceType, quantity: 1000 }];

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.active = 1;

        planet.resources[resA.name] = {
            pool: makePool({ type: resA, quantity: 0, renewable: false }),
            claims: [
                {
                    id: 'a1',
                    resource: resA,
                    quantity: 10000,
                    regenerationRate: 0,
                    maximumCapacity: 10000,
                    tenantAgentId: agent.id,
                    tenantCostInCoins: 0,
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };
        planet.resources[resB.name] = {
            pool: makePool({ type: resB, quantity: 0, renewable: false }),
            claims: [
                {
                    id: 'b1',
                    resource: resB,
                    quantity: 100,
                    regenerationRate: 0,
                    maximumCapacity: 100,
                    tenantAgentId: agent.id,
                    tenantCostInCoins: 0,
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        const recorded = agent.assets.p.productionFacilities.find((f) => f.id === 'scale-fac');
        expect(recorded).toBeDefined();
        const overall = recorded!.lastTickResults?.overallEfficiency ?? 0;
        expect(overall).toBeGreaterThan(0);
        expect(overall).toBeLessThan(1);

        const stored = queryStorageFacility(agent.assets.p.storage, 'Iron Ore');
        expect(stored).toBeLessThan(1000);
    });

    it('stops producing a service entirely when one shared input runs out', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const facility = makeProductionFacility({ secondary: 1 }, { scale: 1 });
        facility.id = 'maint-fac';
        facility.needs = [
            { resource: steelResourceType, quantity: 1 },
            { resource: plasticResourceType, quantity: 1 },
        ];
        facility.produces = [{ resource: maintenanceServiceResourceType, quantity: 1 }];

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.active = 1;
        quietStorageShells(agent);

        setStorageResourceQuantity(agent.assets.p.storage, steelResourceType, 10_000);
        setStorageResourceQuantity(agent.assets.p.storage, plasticResourceType, 0);

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        const recorded = agent.assets.p.productionFacilities.find((f) => f.id === 'maint-fac');
        expect(recorded!.lastTickResults.overallEfficiency).toBe(0);
        expect(queryStorageFacility(agent.assets.p.storage, maintenanceServiceResourceType.name)).toBe(0);
    });

    it('wage costs use actual assigned workers and are not scaled by input efficiency', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        agent.assets.p.wagePerEdu.secondary = 50;

        const facility = makeProductionFacility({ secondary: 1 }, { scale: 1 });
        facility.id = 'wage-fac';

        const resA = ironOreDepositResourceType;
        const resB = { ...ironOreDepositResourceType, name: 'Other Deposit' };
        facility.needs = [
            { resource: resA, quantity: 1000 },
            { resource: resB, quantity: 1000 },
        ];
        facility.produces = [{ resource: ironOreResourceType, quantity: 1000 }];

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.active = 1;

        planet.resources[resA.name] = {
            pool: makePool({ type: resA, quantity: 0, renewable: false }),
            claims: [
                {
                    id: 'a1',
                    resource: resA,
                    quantity: 10000,
                    regenerationRate: 0,
                    maximumCapacity: 10000,
                    tenantAgentId: agent.id,
                    tenantCostInCoins: 0,
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };
        planet.resources[resB.name] = {
            pool: makePool({ type: resB, quantity: 0, renewable: false }),
            claims: [
                {
                    id: 'b1',
                    resource: resB,
                    quantity: 100,
                    regenerationRate: 0,
                    maximumCapacity: 100,
                    tenantAgentId: agent.id,
                    tenantCostInCoins: 0,
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(facility.lastTickResults.overallEfficiency).toBeLessThan(1);

        const used = facility.lastTickResults.totalUsedByEdu.secondary ?? 0;
        expect(used).toBe(1);
        expect(facility.lastTickResults.wageCosts).toBe(50 * used);
    });

    it('records unused workers via lastTickResults.totalUsedByEdu', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const facility = makeProductionFacility({ secondary: 1 }, { scale: 1 });
        facility.id = 'u-fac';
        facility.needs = [{ resource: ironOreDepositResourceType, quantity: 1 }];
        facility.produces = [{ resource: ironOreResourceType, quantity: 1 }];

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.active = 2;

        planet.resources[ironOreDepositResourceType.name] = {
            pool: makePool({ type: ironOreDepositResourceType, quantity: 0, renewable: false }),
            claims: [
                {
                    id: 'd1',
                    resource: ironOreDepositResourceType,
                    quantity: 10,
                    regenerationRate: 0,
                    maximumCapacity: 10,
                    tenantAgentId: agent.id,
                    tenantCostInCoins: 0,
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        const used = facility.lastTickResults?.totalUsedByEdu?.secondary ?? 0;
        expect(used).toBeLessThanOrEqual(1);

        expect(facility.lastTickResults?.overallEfficiency).toBe(1);
    });

    it('scales production efficiency by facility condition', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('condition-coupling');
        quietStorageShells(agent);

        const facility = makeProductionFacility({ none: 10 }, { scale: 1, maintenanceStatus: 0.5 });
        facility.needs = [{ resource: waterResourceType, quantity: 5 }];
        facility.produces = [{ resource: produceResourceType, quantity: 100 }];
        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, waterResourceType, 150);
        agent.assets.p.workforceDemography[30].none.active = 20;

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        const conditionEfficiency = 1 - 0.5 ** 3;
        expect(facility.lastTickResults.overallEfficiency).toBeCloseTo(conditionEfficiency, 10);
        expect(facility.lastTickResults.lastProduced[produceResourceType.name]).toBeCloseTo(
            100 * conditionEfficiency,
            5,
        );
    });
});

describe('productionTick — shared stored-resource allocation', () => {
    beforeEach(() => {
        seedRng(42);
    });

    it('splits scarce stored input proportionally across two facilities sharing the same storage', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('company');

        const facilityA = makeProductionFacility({ none: 1 }, { id: 'fac-a', scale: 400, maxScale: 400 });
        facilityA.needs = [{ resource: waterResourceType, quantity: 800 }];
        facilityA.produces = [{ resource: produceResourceType, quantity: 1000 }];

        const facilityB = makeProductionFacility({ none: 1 }, { id: 'fac-b', scale: 800, maxScale: 800 });
        facilityB.needs = [{ resource: waterResourceType, quantity: 500 }];
        facilityB.produces = [{ resource: ironOreResourceType, quantity: 1000 }];

        const wf = agent.assets.p.workforceDemography;
        wf[30].none.active = 2;

        agent.assets.p.productionFacilities = [facilityA, facilityB];
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, waterResourceType, 720);

        // These large numerical scales are about proportional shortfall across facilities, not about a
        // physical shell boundary; give the storage shells generous room so throughput isn't capacity-capped.
        for (const shell of Object.values(agent.assets.p.storage.shells)) {
            shell.scale = 1_000_000;
            shell.maxScale = shell.scale;
        }

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(facilityB.lastTickResults.overallEfficiency).toBeGreaterThan(0);
        expect(facilityA.lastTickResults.overallEfficiency).toBeGreaterThan(0);

        const remaining = queryStorageFacility(agent.assets.p.storage, waterResourceType.name);
        expect(remaining).toBeLessThanOrEqual(1);

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
        facilityA.produces = [{ resource: produceResourceType, quantity: 100 }];

        const facilityB = makeProductionFacility({ none: 1 }, { id: 'fac-b', scale: 100 });
        facilityB.needs = [{ resource: waterResourceType, quantity: 100 }];
        facilityB.produces = [{ resource: ironOreResourceType, quantity: 100 }];

        const wf = agent.assets.p.workforceDemography;
        wf[30].none.active = 2;

        const initialWater = 500;
        setStorageResourceQuantity(agent.assets.p.storage, waterResourceType, initialWater);

        agent.assets.p.productionFacilities = [facilityA, facilityB];
        authorShellCompartments(agent.assets.p);

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        const remaining = queryStorageFacility(agent.assets.p.storage, waterResourceType.name);
        expect(remaining).toBeGreaterThanOrEqual(0);

        expect(remaining).toBeLessThanOrEqual(initialWater);
    });
});

describe('productionTick — storage space clamp', () => {
    beforeEach(() => {
        seedRng(12345);
    });

    function makeWaterConsumer() {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('clamped-company');
        const facility = makeProductionFacility({ secondary: 1 }, { scale: 10, maxScale: 10 });
        facility.needs = [{ resource: waterResourceType, quantity: 100 }];
        facility.produces = [{ resource: produceResourceType, quantity: 1000 }];
        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        // Water (100k units) must fit the liquid shell before this test measures throttling on the
        // solid product compartment only.
        agent.assets.p.storage.shells.liquid.scale = 5;
        agent.assets.p.storage.shells.liquid.maxScale = agent.assets.p.storage.shells.liquid.scale;
        setStorageResourceQuantity(agent.assets.p.storage, waterResourceType, 100000);
        agent.assets.p.workforceDemography[30].secondary.active = 200;
        const gs = makeGameState(planet, [agent, gov]);
        return { planet, agent, facility, gs };
    }

    // Constrain the (default huge) solid shell so Produce can hold at most `capQuantity` units.
    function capProduceCompartment(assets: AgentPlanetAssets, capQuantity: number) {
        const vp = produceResourceType.volumePerQuantity;
        const mp = produceResourceType.massPerQuantity;
        assets.storage.shells.solid.capacity = { volume: capQuantity * vp, mass: capQuantity * mp };
        assets.storage.shells.solid.compartments[produceResourceType.name] = 1;
    }

    it('produces at full efficiency while the product compartment has room', () => {
        const { planet, agent, facility, gs } = makeWaterConsumer();
        productionTick(gs, planet);
        const produced = queryStorageFacility(agent.assets.p.storage, produceResourceType.name);
        expect(produced).toBeCloseTo(10000, 0);
        expect(facility.lastTickResults.overallEfficiency).toBeCloseTo(1, 5);
    });

    it('throttles output to the product-compartment free room', () => {
        const { planet, agent, facility, gs } = makeWaterConsumer();
        capProduceCompartment(agent.assets.p, 6000);
        // Pre-fill most of the compartment with existing produce.
        setStorageResourceQuantity(agent.assets.p.storage, produceResourceType, 3000);
        productionTick(gs, planet);
        const produced = queryStorageFacility(agent.assets.p.storage, produceResourceType.name);
        // 3000 free of this tick, so the 10000 produced is clamped to the free cell (3000).
        expect(produced).toBeCloseTo(6000, 0);
        expect(facility.lastTickResults.overallEfficiency).toBeCloseTo(1, 5);
    });

    it('stops producing into a compartment that is already exactly full (no overflow)', () => {
        const { planet, agent, facility, gs } = makeWaterConsumer();
        capProduceCompartment(agent.assets.p, 6000);
        setStorageResourceQuantity(agent.assets.p.storage, produceResourceType, 6000);
        productionTick(gs, planet);
        // The full compartment cannot take this tick's output, so nothing more is put in.
        const storedAfter = queryStorageFacility(agent.assets.p.storage, produceResourceType.name);
        expect(storedAfter).toBeCloseTo(6000, 0);
        expect(facility.lastTickResults.lastProduced[produceResourceType.name]).toBeCloseTo(0, 0);
    });

    it('scales input consumption down with the throttled production', () => {
        const { planet, agent, gs } = makeWaterConsumer();
        capProduceCompartment(agent.assets.p, 6000);
        productionTick(gs, planet);
        // Clamp factor is 6000/10000 = 0.6 → water input 1000/tick becomes 600 consumed.
        const water = queryStorageFacility(agent.assets.p.storage, waterResourceType.name);
        expect(water).toBeCloseTo(100000 - 600, 0);
    });
});

describe('computeStorageSpaceFactor', () => {
    it('returns 1 when the product compartment has ample free room', () => {
        const facility = makeProductionFacility({ none: 1 }, { scale: 10, maxScale: 10 });
        facility.produces = [{ resource: produceResourceType, quantity: 1000 }];
        const agent = makeAgent('roomy-compartment');
        agent.assets.p.productionFacilities.push(facility);
        authorShellCompartments(agent.assets.p);
        expect(computeStorageSpaceFactor(facility, agent.assets.p)).toBeCloseTo(1, 10);
    });

    it('takes the minimum factor across multiple solid outputs sharing the solid shell', () => {
        const facility = makeProductionFacility({ none: 1 }, { scale: 10, maxScale: 10 });
        facility.produces = [
            { resource: produceResourceType, quantity: 1000 },
            { resource: ironOreResourceType, quantity: 1000 },
        ];
        const agent = makeAgent('multi-output');
        // Give both products a half-share each of a solid shell that can only fit one of each well.
        const solidCap = 5000; // each half comp fits 2500 → factor 0.5 at scale 10 (perTick 10000... )
        agent.assets.p.storage.shells.solid.capacity = { volume: solidCap, mass: solidCap };
        agent.assets.p.storage.shells.solid.compartments[produceResourceType.name] = 0.5;
        agent.assets.p.storage.shells.solid.compartments[ironOreResourceType.name] = 0.5;
        // produce massPerQ 1, ironOre massPerQ 1 → each compartment freeQty = 0.5*5000 = 2500 (both by mass)
        expect(computeStorageSpaceFactor(facility, agent.assets.p)).toBeCloseTo(0.25, 6);
    });

    it('returns 1 for facilities without storage outputs', () => {
        const facility = makeProductionFacility({ none: 1 }, { scale: 10, maxScale: 10 });
        const agent = makeAgent('no-output');
        expect(computeStorageSpaceFactor(facility, agent.assets.p)).toBeCloseTo(1, 10);
    });
});

describe('constructionTick', () => {
    beforeEach(() => {
        seedRng(12345);
    });

    it('consumes construction service and advances progress', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const facility = makeProductionFacility({ secondary: 1 }, { scale: 0, maxScale: 0 });
        facility.id = 'facility-under-construction';
        facility.construction = {
            type: 'new',
            constructionTargetMaxScale: 1,
            totalConstructionServiceRequired: 100,
            maximumConstructionServiceConsumption: 50,
            progress: 0,
            lastTickInvestedConstructionServices: 0,
            suspended: false,
        };

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);

        setStorageResourceQuantity(agent.assets.p.storage, constructionServiceResourceType, 80);

        const gs = makeGameState(planet, [agent, gov]);
        constructionTick(gs, planet);

        expect(facility.construction).not.toBeNull();
        expect(facility.construction!.progress).toBe(50);
        const remaining = queryStorageFacility(agent.assets.p.storage, constructionServiceResourceType.name);
        expect(remaining).toBe(30);
    });

    it('does not consume or advance a suspended construction', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const facility = makeProductionFacility({ secondary: 1 }, { scale: 0, maxScale: 0 });
        facility.id = 'facility-suspended';
        facility.construction = {
            type: 'new',
            constructionTargetMaxScale: 1,
            totalConstructionServiceRequired: 100,
            maximumConstructionServiceConsumption: 50,
            progress: 10,
            lastTickInvestedConstructionServices: 50,
            suspended: true,
        };

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);

        setStorageResourceQuantity(agent.assets.p.storage, constructionServiceResourceType, 80);

        const gs = makeGameState(planet, [agent, gov]);
        constructionTick(gs, planet);

        expect(facility.construction).not.toBeNull();
        expect(facility.construction!.progress).toBe(10);
        expect(facility.construction!.lastTickInvestedConstructionServices).toBe(0);
        const remaining = queryStorageFacility(agent.assets.p.storage, constructionServiceResourceType.name);
        expect(remaining).toBe(80);
    });

    it('completes construction when progress reaches totalConstructionServiceRequired', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const facility = makeProductionFacility({ secondary: 1 }, { scale: 0, maxScale: 0 });
        facility.id = 'completing-facility';
        facility.construction = {
            type: 'new',
            constructionTargetMaxScale: 3,
            totalConstructionServiceRequired: 100,
            maximumConstructionServiceConsumption: 50,
            progress: 90,
            lastTickInvestedConstructionServices: 0,
            suspended: false,
        };

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, constructionServiceResourceType, 20);

        const gs = makeGameState(planet, [agent, gov]);
        constructionTick(gs, planet);

        expect(facility.construction).toBeNull();
        expect(facility.maxScale).toBe(3);
    });

    it('does not advance progress when no construction service is available', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const facility = makeProductionFacility({ secondary: 1 }, { scale: 0, maxScale: 0 });
        facility.id = 'stalled-facility';
        facility.construction = {
            type: 'new',
            constructionTargetMaxScale: 1,
            totalConstructionServiceRequired: 100,
            maximumConstructionServiceConsumption: 50,
            progress: 10,
            lastTickInvestedConstructionServices: 0,
            suspended: false,
        };

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);

        const gs = makeGameState(planet, [agent, gov]);
        constructionTick(gs, planet);

        expect(facility.construction).not.toBeNull();
        expect(facility.construction!.progress).toBe(10);
    });

    it('applies constructionTick to storageFacility and humanResourcesDepartment as well', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const mgmtFacility = makeHRFacility({ none: 1 }, { id: 'mgmt-under-construction', scale: 0, maxScale: 0 });
        mgmtFacility.construction = {
            type: 'new',
            constructionTargetMaxScale: 2,
            totalConstructionServiceRequired: 60,
            maximumConstructionServiceConsumption: 30,
            progress: 0,
            lastTickInvestedConstructionServices: 0,
            suspended: false,
        };

        agent.assets.p.humanResourcesDepartment = mgmtFacility;
        setStorageResourceQuantity(agent.assets.p.storage, constructionServiceResourceType, 30);

        const gs = makeGameState(planet, [agent, gov]);
        constructionTick(gs, planet);

        expect(mgmtFacility.construction!.progress).toBe(30);
    });

    it('preserves non-zero scale when expansion completes while facility is at the PID minimum', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const maxScale = 100;
        const facility = makeProductionFacility({ secondary: 1 }, { scale: maxScale * 0.1, maxScale });
        facility.id = 'low-scale-expansion';
        facility.construction = {
            type: 'expansion',
            constructionTargetMaxScale: 200,
            totalConstructionServiceRequired: 100,
            maximumConstructionServiceConsumption: 50,
            progress: 90,
            lastTickInvestedConstructionServices: 0,
            suspended: false,
        };

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, constructionServiceResourceType, 20);

        const gs = makeGameState(planet, [agent, gov]);
        constructionTick(gs, planet);

        expect(facility.construction).toBeNull();
        expect(facility.maxScale).toBe(200);
        expect(facility.scale).toBeGreaterThan(0);
        expect(facility.scale).toBeCloseTo(200 * MIN_SCALE_FRACTION, 5);
    });

    it('preserves scale proportion when expansion completes at 50% of old maxScale', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const maxScale = 100;
        const facility = makeProductionFacility({ secondary: 1 }, { scale: maxScale * 0.5, maxScale });
        facility.id = 'half-scale-expansion';
        facility.construction = {
            type: 'expansion',
            constructionTargetMaxScale: 200,
            totalConstructionServiceRequired: 100,
            maximumConstructionServiceConsumption: 50,
            progress: 90,
            lastTickInvestedConstructionServices: 0,
            suspended: false,
        };

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, constructionServiceResourceType, 20);

        const gs = makeGameState(planet, [agent, gov]);
        constructionTick(gs, planet);

        expect(facility.construction).toBeNull();
        expect(facility.maxScale).toBe(200);
        // 50% of old maxScale = 50 -> 50% fraction of new maxScale = 100
        expect(facility.scale).toBeCloseTo(100, 5);
    });

    it('records lastTickInvestedConstructionServices after partial consumption', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const facility = makeProductionFacility({ secondary: 1 }, { scale: 0, maxScale: 0 });
        facility.id = 'partial-cs';
        facility.construction = {
            type: 'new',
            constructionTargetMaxScale: 1,
            totalConstructionServiceRequired: 100,
            maximumConstructionServiceConsumption: 50,
            progress: 0,
            lastTickInvestedConstructionServices: 0,
            suspended: false,
        };

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, constructionServiceResourceType, 30);

        const gs = makeGameState(planet, [agent, gov]);
        constructionTick(gs, planet);

        expect(facility.construction!.lastTickInvestedConstructionServices).toBe(30);
        expect(facility.construction!.progress).toBe(30);
        expect(facility.construction).not.toBeNull();
    });

    it('blends condition per scale-weight when expansion completes', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const facility = makeProductionFacility(
            { secondary: 1 },
            { scale: 1, maxScale: 1, maintenanceStatus: 0.5, maxMaintenance: 0.8, cumulativeRepairAcc: 0.4 },
        );
        facility.id = 'condition-blend-expansion';
        facility.construction = {
            type: 'expansion',
            constructionTargetMaxScale: 2,
            totalConstructionServiceRequired: 100,
            maximumConstructionServiceConsumption: 50,
            progress: 90,
            lastTickInvestedConstructionServices: 0,
            suspended: false,
        };

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, constructionServiceResourceType, 20);

        const gs = makeGameState(planet, [agent, gov]);
        constructionTick(gs, planet);

        expect(facility.construction).toBeNull();
        expect(facility.maxScale).toBe(2);
        expect(facility.maxMaintenance).toBeCloseTo(0.9, 10);
        expect(facility.maintenanceStatus).toBeCloseTo(0.75, 10);
        expect(facility.cumulativeRepairAcc).toBeCloseTo(0.2, 10);
    });
});

describe('constructionTick — facilityCompleted ticker events', () => {
    beforeEach(() => {
        seedRng(12345);
    });

    it('emits a facilityCompleted event when a facility finishes construction', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('builder');

        const facility = makeProductionFacility({ secondary: 1 }, { scale: 0, maxScale: 0 });
        facility.id = 'completing-facility';
        facility.name = 'Iron Mine';
        facility.construction = {
            type: 'new',
            constructionTargetMaxScale: 1,
            totalConstructionServiceRequired: 10,
            maximumConstructionServiceConsumption: 50,
            progress: 9,
            lastTickInvestedConstructionServices: 0,
            suspended: false,
        };

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, constructionServiceResourceType, 20);

        const gs = makeGameState(planet, [agent, gov], 5);

        constructionTick(gs, planet);

        expect(facility.construction).toBeNull();
        expect(gs.tickerEvents).toHaveLength(1);
        const ev = gs.tickerEvents[0]!;
        expect(ev.category).toBe('facilityCompleted');
        expect(ev.planetId).toBe(planet.id);
        expect(ev.agentId).toBe(agent.id);
        expect(ev.agentName).toBe(agent.name);
        expect(ev.tick).toBe(5);
        expect(ev.details).toMatchObject({
            kind: 'facilityCompleted',
            facilityName: expect.stringContaining('Iron Mine'),
        });
        expect(ev.id).toBeTypeOf('number');
    });

    it('does not emit facilityCompleted when construction is still in progress', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('builder');

        const facility = makeProductionFacility({ secondary: 1 }, { scale: 0, maxScale: 0 });
        facility.construction = {
            type: 'new',
            constructionTargetMaxScale: 1,
            totalConstructionServiceRequired: 100,
            maximumConstructionServiceConsumption: 50,
            progress: 10,
            lastTickInvestedConstructionServices: 0,
            suspended: false,
        };

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, constructionServiceResourceType, 20);

        const gs = makeGameState(planet, [agent, gov]);

        constructionTick(gs, planet);

        expect(facility.construction).not.toBeNull();
        expect(gs.tickerEvents).toHaveLength(0);
    });

    it('assigns a unique id to the facilityCompleted event', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('builder');

        const f1 = makeProductionFacility({ secondary: 1 }, { scale: 0, maxScale: 0 });
        f1.id = 'f1';
        f1.name = 'Facility One';
        f1.construction = {
            type: 'new',
            constructionTargetMaxScale: 1,
            totalConstructionServiceRequired: 5,
            maximumConstructionServiceConsumption: 50,
            progress: 4,
            lastTickInvestedConstructionServices: 0,
            suspended: false,
        };

        const f2 = makeProductionFacility({ secondary: 1 }, { scale: 0, maxScale: 0 });
        f2.id = 'f2';
        f2.name = 'Facility Two';
        f2.construction = {
            type: 'new',
            constructionTargetMaxScale: 1,
            totalConstructionServiceRequired: 5,
            maximumConstructionServiceConsumption: 50,
            progress: 4,
            lastTickInvestedConstructionServices: 0,
            suspended: false,
        };

        agent.assets.p.productionFacilities = [f1, f2];
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, constructionServiceResourceType, 100);

        const gs = makeGameState(planet, [agent, gov]);

        constructionTick(gs, planet);

        expect(gs.tickerEvents).toHaveLength(2);
        expect(gs.tickerEvents[0]!.id).toBe(1);
        expect(gs.tickerEvents[1]!.id).toBe(2);
    });
});

describe('productionTick — storage department', () => {
    beforeEach(() => {
        seedRng(12345);
    });

    it('includes storage department in worker allocation and populates lastTickResults', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        agent.assets.p.storage = makeStorageFacility({
            planetId: 'p',
            id: 'storage-p',
            department: {
                ...makeManagementFacility({ none: 1 }, { id: 'storage-dept' }),
                transportBuffer: 0,
                transportStarvation: 0,
            },
        });

        const wf = agent.assets.p.workforceDemography;
        wf[30].none.active = 2;

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        const results = agent.assets.p.storage.department!.lastTickResults;
        expect(results).toBeDefined();
        expect(results.overallEfficiency).toBeGreaterThan(0);
    });

    it('excludes storage department under construction from productionTick', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        agent.assets.p.storage = makeStorageFacility({
            planetId: 'p',
            id: 'storage-p',
            department: {
                ...makeManagementFacility(
                    { none: 1 },
                    {
                        id: 'storage-dept',
                        scale: 0,
                        maxScale: 0,
                        construction: {
                            type: 'new',
                            constructionTargetMaxScale: 1,
                            totalConstructionServiceRequired: 100,
                            maximumConstructionServiceConsumption: 50,
                            progress: 0,
                            lastTickInvestedConstructionServices: 0,
                            suspended: false,
                        },
                    },
                ),
                transportBuffer: 0,
                transportStarvation: 0,
            },
        });

        const wf = agent.assets.p.workforceDemography;
        wf[30].none.active = 1;

        const initialEfficiency = agent.assets.p.storage.department!.lastTickResults.overallEfficiency;

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(agent.assets.p.storage.department!.lastTickResults.overallEfficiency).toBe(initialEfficiency);
    });
});

describe('productionTick — humanResourcesDepartment', () => {
    beforeEach(() => {
        seedRng(12345);
    });

    it('human resources department consumes stored input and produces output', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const mgmtFacility = makeHRFacility(
            { none: 1 },
            {
                id: 'mgmt-1',
                scale: 1,
                needs: [{ resource: administrativeServiceResourceType, quantity: 5 }],
                produces: [{ resource: humanResourcesServiceResourceType, quantity: 10 }],
            },
        );

        agent.assets.p.humanResourcesDepartment = mgmtFacility;
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, administrativeServiceResourceType, 50);

        const wf = agent.assets.p.workforceDemography;
        wf[30].none.active = 1;

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(mgmtFacility.lastTickResults.overallEfficiency).toBeGreaterThan(0);
        expect(mgmtFacility.lastTickResults.lastConsumed[administrativeServiceResourceType.name]).toBeGreaterThan(0);
        expect(mgmtFacility.lastTickResults.lastProduced[humanResourcesServiceResourceType.name]).toBeGreaterThan(0);

        const remaining = queryStorageFacility(agent.assets.p.storage, administrativeServiceResourceType.name);
        expect(remaining).toBeLessThan(50);
    });

    it('human resources department does not produce at zero efficiency', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const mgmtFacility = makeHRFacility(
            { none: 1 },
            {
                id: 'mgmt-noworker',
                scale: 1,
                needs: [],
                produces: [{ resource: steelResourceType, quantity: 10 }],
            },
        );

        agent.assets.p.humanResourcesDepartment = mgmtFacility;

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(mgmtFacility.lastTickResults.overallEfficiency).toBe(0);
        expect(mgmtFacility.lastTickResults.lastProduced[steelResourceType.name] ?? 0).toBe(0);
    });

    it('human resources department under construction is excluded from productionTick', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const mgmtFacility = makeHRFacility(
            { none: 1 },
            {
                id: 'mgmt-under-construction',
                scale: 0,
                maxScale: 0,
                construction: {
                    type: 'new',
                    constructionTargetMaxScale: 1,
                    totalConstructionServiceRequired: 100,
                    maximumConstructionServiceConsumption: 50,
                    progress: 0,
                    lastTickInvestedConstructionServices: 0,
                    suspended: false,
                },
            },
        );

        agent.assets.p.humanResourcesDepartment = mgmtFacility;
        const wf = agent.assets.p.workforceDemography;
        wf[30].none.active = 1;

        const initialEfficiency = mgmtFacility.lastTickResults.overallEfficiency;

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(mgmtFacility.lastTickResults.overallEfficiency).toBe(initialEfficiency);
        expect(mgmtFacility.lastTickResults.lastProduced[steelResourceType.name] ?? 0).toBe(0);
    });
});

describe('productionTick — HR scarcity scales down non-HR facility inputs', () => {
    beforeEach(() => {
        seedRng(12345);
    });

    it('worker efficiency is limited by available headcount when hrProductivityMultiplier is low (production)', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const facility = makeProductionFacility({ none: 10 }, { id: 'hr-scarce-prod', scale: 2 });
        quietStorageShells(agent);
        facility.needs = [{ resource: waterResourceType, quantity: 100 }];
        facility.produces = [{ resource: steelResourceType, quantity: 100 }];

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, waterResourceType, 6000);
        agent.assets.p.hrProductivityMultiplier = 0.3;
        agent.assets.p.workforceDemography[30].none.active = 25;

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(facility.lastTickResults.overallEfficiency).toBeCloseTo(0.375, 2);
        expect(facility.lastTickResults.lastConsumed[waterResourceType.name]).toBeCloseTo(75, 0);
        expect(facility.lastTickResults.lastProduced[steelResourceType.name]).toBeCloseTo(75, 0);

        const remaining = queryStorageFacility(agent.assets.p.storage, waterResourceType.name);
        expect(remaining).toBeCloseTo(6000 - 75, -1);
    });

    it('worker efficiency is limited by available headcount when hrProductivityMultiplier < 1', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('builder');
        quietStorageShells(agent);
        const shipType: TransportShipType = {
            type: 'transport',
            name: 'HR Scarce Freighter',
            scale: 'small',
            speed: 1,
            cargoSpecification: { type: 'solid', volume: 1000, mass: 1000 },
            requiredCrew: { none: 0, primary: 0, secondary: 1, tertiary: 0 },
            buildingCost: [{ resource: steelResourceType, quantity: 900 }],
            buildingTime: 90,
        };

        const shipyard = makeShipConstructionFacility({ secondary: 3 }, { id: 'hr-scarce-sy', scale: 9, shipType });
        agent.assets.p.shipConstructionFacilities = [shipyard];
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, steelResourceType, 1000);
        agent.assets.p.hrProductivityMultiplier = 0.3;
        agent.assets.p.workforceDemography[30].secondary.active = 30;

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        const part = Math.min(1, Math.sqrt(9) / 90);
        const requiredPerTick = 900 * part;
        expect(shipyard.lastTickResults.overallEfficiency).toBeCloseTo(0.333, 2);
        expect(shipyard.lastTickResults.lastConsumed[steelResourceType.name]).toBeCloseTo(requiredPerTick * 0.333, 0);
    });

    it('does not apply hrProductivityMultiplier to the HR department itself', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const hrFacility = makeHRFacility(
            { none: 2 },
            {
                id: 'hr-own',
                scale: 1,
                needs: [{ resource: administrativeServiceResourceType, quantity: 5 }],
                produces: [{ resource: humanResourcesServiceResourceType, quantity: 10 }],
            },
        );

        agent.assets.p.humanResourcesDepartment = hrFacility;
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, administrativeServiceResourceType, 150);
        agent.assets.p.hrProductivityMultiplier = 0.3;
        agent.assets.p.workforceDemography[30].none.active = 10;

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(hrFacility.lastTickResults.overallEfficiency).toBeCloseTo(1);
    });

    it('reaches full worker efficiency with enough workers when hrProductivityMultiplier < 1', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('hr-penalty');
        quietStorageShells(agent);

        const facility = makeProductionFacility({ none: 10 }, { scale: 1 });
        facility.needs = [{ resource: waterResourceType, quantity: 5 }];
        facility.produces = [{ resource: produceResourceType, quantity: 100 }];
        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, waterResourceType, 150);
        agent.assets.p.hrProductivityMultiplier = 0.5;
        agent.assets.p.workforceDemography[30].none.active = 20;

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(facility.lastTickResults.overallEfficiency).toBeCloseTo(1);
        expect(facility.lastTickResults.totalUsedByEdu.none).toBe(20);
        expect(facility.lastTickResults.lastProduced[produceResourceType.name]).toBeCloseTo(100);
    });

    it('prioritizes HR department allocation over production facilities when workers are scarce', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const hrFacility = makeHRFacility(
            { none: 5 },
            {
                id: 'hr-dept',
                scale: 1,
                needs: [{ resource: waterResourceType, quantity: 1 }],
                produces: [{ resource: steelResourceType, quantity: 1 }],
            },
        );

        const prodFacility = makeProductionFacility({ none: 10 }, { id: 'prod-1', scale: 1 });
        prodFacility.needs = [{ resource: waterResourceType, quantity: 5 }];
        prodFacility.produces = [{ resource: ironOreResourceType, quantity: 5 }];

        agent.assets.p.humanResourcesDepartment = hrFacility;
        agent.assets.p.productionFacilities = [prodFacility];
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, waterResourceType, 180);

        agent.assets.p.workforceDemography[30].none.active = 5;

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(hrFacility.lastTickResults.overallEfficiency).toBeCloseTo(1);
        expect(prodFacility.lastTickResults.overallEfficiency).toBeCloseTo(0);
    });
});

function makeTestShipType(): TransportShipType {
    return {
        name: 'Freighter',
        scale: 'small',
        speed: 1,
        cargoSpecification: { type: 'solid', volume: 5000, mass: 5000 },
        requiredCrew: { none: 0, primary: 0, secondary: 1, tertiary: 0 },
        buildingCost: [{ resource: steelResourceType, quantity: 900 }],
        buildingTime: 90,
        type: 'transport',
    };
}

describe('productionTick — shipyard facility (building mode)', () => {
    beforeEach(() => {
        seedRng(12345);
    });

    it('consumes building cost proportionally and records lastConsumed', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('builder');
        quietStorageShells(agent);
        const shipType = makeTestShipType();

        const shipyard = makeShipConstructionFacility({ secondary: 1 }, { id: 'sy-1', scale: 9, shipType });

        agent.assets.p.shipConstructionFacilities = [shipyard];
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, steelResourceType, 60);

        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.active = 9;

        const gs = makeGameState(planet, [agent, gov]);

        productionTick(gs, planet);

        expect(shipyard.lastTickResults.overallEfficiency).toBeCloseTo(1, 5);
        const consumed = shipyard.lastTickResults.lastConsumed[steelResourceType.name] ?? 0;
        expect(consumed).toBeCloseTo(30, 5);

        const remaining = queryStorageFacility(agent.assets.p.storage, steelResourceType.name);
        expect(remaining).toBeCloseTo(30, 5);
    });

    it('records zero consumption and zero efficiency when no workers are available', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('builder');
        const shipType = makeTestShipType();

        const shipyard = makeShipConstructionFacility({ secondary: 1 }, { id: 'sy-zero', scale: 1, shipType });
        agent.assets.p.shipConstructionFacilities = [shipyard];
        authorShellCompartments(agent.assets.p);
        setStorageResourceQuantity(agent.assets.p.storage, steelResourceType, 100);

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(shipyard.lastTickResults.overallEfficiency).toBe(0);
        expect(shipyard.lastTickResults.lastConsumed[steelResourceType.name]).toBe(0);

        const remaining = queryStorageFacility(agent.assets.p.storage, steelResourceType.name);
        expect(remaining).toBe(100);
    });

    it('shipyard under construction is excluded from productionTick', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('builder');
        const shipType = makeTestShipType();

        const shipyard = makeShipConstructionFacility(
            { secondary: 1 },
            {
                id: 'sy-uc',
                scale: 0,
                maxScale: 0,
                shipType,
                construction: {
                    type: 'new',
                    constructionTargetMaxScale: 1,
                    totalConstructionServiceRequired: 100,
                    maximumConstructionServiceConsumption: 50,
                    progress: 0,
                    lastTickInvestedConstructionServices: 0,
                    suspended: false,
                },
            },
        );

        agent.assets.p.shipConstructionFacilities = [shipyard];
        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.active = 1;
        const initialEfficiency = shipyard.lastTickResults.overallEfficiency;

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(shipyard.lastTickResults.overallEfficiency).toBe(initialEfficiency);
    });
});

describe('productionTick — shipCompleted ticker events', () => {
    beforeEach(() => {
        seedRng(12345);
    });

    it('emits a shipCompleted event when a ship finishes construction', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('shipbuilder');
        quietStorageShells(agent);

        const shipType = {
            type: 'transport' as const,
            name: 'Quick Freighter',
            scale: 'small' as const,
            speed: 1,
            cargoSpecification: { type: 'solid' as const, volume: 1000, mass: 1000 },
            requiredCrew: { none: 0, primary: 0, secondary: 1, tertiary: 0 },
            buildingCost: [],
            buildingTime: 1,
        };

        const shipyard = makeShipConstructionFacility(
            { secondary: 1 },
            { id: 'sy-complete', scale: 1, shipType, progress: 0 },
        );
        agent.assets.p.shipConstructionFacilities = [shipyard];

        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.active = 1;

        const gs = makeGameState(planet, [agent, gov], 10);

        productionTick(gs, planet);

        expect(gs.tickerEvents).toHaveLength(1);
        const ev = gs.tickerEvents[0]!;
        expect(ev.category).toBe('shipCompleted');
        expect(ev.planetId).toBe(planet.id);
        expect(ev.agentId).toBe(agent.id);
        expect(ev.tick).toBe(10);
        expect(ev.details).toMatchObject({ kind: 'shipCompleted', shipName: expect.stringContaining('SS Test') });
        expect(ev.id).toBeTypeOf('number');

        expect(agent.ships).toHaveLength(1);
    });

    it('does not emit shipCompleted when construction is still in progress', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('shipbuilder');

        const shipType = {
            type: 'transport' as const,
            name: 'Slow Freighter',
            scale: 'small' as const,
            speed: 1,
            cargoSpecification: { type: 'solid' as const, volume: 1000, mass: 1000 },
            requiredCrew: { none: 0, primary: 0, secondary: 1, tertiary: 0 },
            buildingCost: [],
            buildingTime: 9000,
        };

        const shipyard = makeShipConstructionFacility(
            { secondary: 1 },
            { id: 'sy-slow', scale: 1, shipType, progress: 0 },
        );
        agent.assets.p.shipConstructionFacilities = [shipyard];

        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.active = 1;

        const gs = makeGameState(planet, [agent, gov]);

        productionTick(gs, planet);

        expect(gs.tickerEvents).toHaveLength(0);
        expect(agent.ships).toHaveLength(0);
    });
});

describe('productionTick — XP boost effect on production', () => {
    beforeEach(() => {
        seedRng(12345);
    });

    it('workers with high XP produce more effective output from the same headcount', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('xp-company');

        const facility = makeProductionFacility({ secondary: 2 }, { scale: 2 });
        facility.id = 'xp-fac';
        facility.needs = [{ resource: ironOreDepositResourceType, quantity: 1000 }];
        facility.produces = [{ resource: ironOreResourceType, quantity: 1000 }];

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        const wf = agent.assets.p.workforceDemography;

        wf[30].secondary.active = 1;

        wf[30].secondary.workforceExperience = 40;

        planet.resources[ironOreDepositResourceType.name] = {
            pool: makePool({ type: ironOreDepositResourceType, quantity: 0, renewable: false }),
            claims: [
                {
                    id: 'd1',
                    resource: ironOreDepositResourceType,
                    quantity: 10000,
                    regenerationRate: 0,
                    maximumCapacity: 10000,
                    tenantAgentId: agent.id,
                    tenantCostInCoins: 0,
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        const recorded = agent.assets.p.productionFacilities.find((f) => f.id === 'xp-fac');
        expect(recorded).toBeDefined();

        const expectedEfficiency = 0.32916667;
        expect(recorded!.lastTickResults.overallEfficiency).toBeCloseTo(expectedEfficiency, 4);

        const storedIron = queryStorageFacility(agent.assets.p.storage, ironOreResourceType.name);
        expect(storedIron).toBeCloseTo(facility.produces[0]!.quantity * facility.scale * expectedEfficiency, 4);
    });

    it('workers with zero XP produce less than those with high XP (same headcount)', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('no-xp-company');

        const facility = makeProductionFacility({ secondary: 2 }, { scale: 2 });
        facility.id = 'no-xp-fac';
        facility.needs = [{ resource: ironOreDepositResourceType, quantity: 1000 }];
        facility.produces = [{ resource: ironOreResourceType, quantity: 1000 }];

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.active = 1;

        planet.resources[ironOreDepositResourceType.name] = {
            pool: makePool({ type: ironOreDepositResourceType, quantity: 0, renewable: false }),
            claims: [
                {
                    id: 'd2',
                    resource: ironOreDepositResourceType,
                    quantity: 10000,
                    regenerationRate: 0,
                    maximumCapacity: 10000,
                    tenantAgentId: agent.id,
                    tenantCostInCoins: 0,
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        const recorded = agent.assets.p.productionFacilities.find((f) => f.id === 'no-xp-fac');
        expect(recorded).toBeDefined();

        const expectedEfficiency = 0.25;
        expect(recorded!.lastTickResults.overallEfficiency).toBeCloseTo(expectedEfficiency, 4);

        const storedIron = queryStorageFacility(agent.assets.p.storage, ironOreResourceType.name);
        expect(storedIron).toBeCloseTo(facility.produces[0]!.quantity * facility.scale * expectedEfficiency, 4);
    });

    it('XP is averaged across all workers in the same edu category', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('mixed-xp-company');
        quietStorageShells(agent);

        const facility = makeProductionFacility({ secondary: 2 }, { scale: 2 });
        facility.id = 'mixed-xp-fac';
        facility.needs = [{ resource: ironOreDepositResourceType, quantity: 1000 }];
        facility.produces = [{ resource: ironOreResourceType, quantity: 1000 }];

        agent.assets.p.productionFacilities = [facility];
        authorShellCompartments(agent.assets.p);
        const wf = agent.assets.p.workforceDemography;

        wf[30].secondary.active = 1;
        wf[30].secondary.workforceExperience = 0;
        wf[50].secondary.active = 1;
        wf[50].secondary.workforceExperience = 80;

        planet.resources[ironOreDepositResourceType.name] = {
            pool: makePool({ type: ironOreDepositResourceType, quantity: 0, renewable: false }),
            claims: [
                {
                    id: 'd3',
                    resource: ironOreDepositResourceType,
                    quantity: 10000,
                    regenerationRate: 0,
                    maximumCapacity: 10000,
                    tenantAgentId: agent.id,
                    tenantCostInCoins: 0,
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        const recorded = agent.assets.p.productionFacilities.find((f) => f.id === 'mixed-xp-fac');
        expect(recorded).toBeDefined();

        const expectedEfficiency = 0.65833333;
        expect(recorded!.lastTickResults.overallEfficiency).toBeCloseTo(expectedEfficiency, 4);

        const storedIron = queryStorageFacility(agent.assets.p.storage, ironOreResourceType.name);
        expect(storedIron).toBeCloseTo(facility.produces[0]!.quantity * facility.scale * expectedEfficiency, 4);
    });
});
