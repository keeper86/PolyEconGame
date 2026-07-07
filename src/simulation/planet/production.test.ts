import { beforeEach, describe, expect, it } from 'vitest';
import { seedRng } from '../utils/stochasticRound';
import { constructionTick, productionTick } from './production';

import type { TransportShipType } from '../ships/ships';
import {
    makeAgent,
    makeGameState,
    makeManagementFacility,
    makePlanetWithPopulation,
    makeProductionFacility,
    makeShipConstructionFacility,
    makeStorageFacility,
} from '../utils/testHelper';
import { ironOreDepositResourceType } from './landBoundResources';
import { produceResourceType, ironOreResourceType, steelResourceType, waterResourceType } from './resources';
import { constructionServiceResourceType } from './services';
import { makePool } from '../initialUniverse/resourceClaimFactory';

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
        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.novice.active = 1;

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

        const storedIron = agent.assets.p.storageFacility.currentInStorage['Iron Ore']?.quantity || 0;

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
        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.novice.active = 1;

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
        const storedIron = agent.assets.p.storageFacility.currentInStorage['Iron Ore']?.quantity || 0;
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
        const wf = agent.assets.p.workforceDemography;
        wf[30].primary.novice.active = 1;

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
        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.novice.active = 1;

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
        wf[30].secondary.novice.active = 2;

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
});

describe('productionTick — shared stored-resource allocation', () => {
    beforeEach(() => {
        seedRng(42);
    });

    it('splits scarce stored input proportionally across two facilities sharing the same storage', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('company');

        const facilityA = makeProductionFacility({ none: 1 }, { id: 'fac-a', scale: 400 });
        facilityA.needs = [{ resource: waterResourceType, quantity: 800 }];
        facilityA.produces = [{ resource: produceResourceType, quantity: 1000 }];

        const facilityB = makeProductionFacility({ none: 1 }, { id: 'fac-b', scale: 800 });
        facilityB.needs = [{ resource: waterResourceType, quantity: 500 }];
        facilityB.produces = [{ resource: ironOreResourceType, quantity: 1000 }];

        const wf = agent.assets.p.workforceDemography;
        wf[30].none.novice.active = 2;

        agent.assets.p.storageFacility.currentInStorage[waterResourceType.name] = {
            resource: waterResourceType,
            quantity: 720,
        };
        agent.assets.p.storageFacility.current.volume = 720 * waterResourceType.volumePerQuantity;
        agent.assets.p.storageFacility.current.mass = 720 * waterResourceType.massPerQuantity;

        agent.assets.p.productionFacilities = [facilityA, facilityB];

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(facilityA.lastTickResults.overallEfficiency).toBeGreaterThan(0);
        expect(facilityB.lastTickResults.overallEfficiency).toBeGreaterThan(0);

        const remaining = agent.assets.p.storageFacility.currentInStorage[waterResourceType.name]?.quantity ?? 0;
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
        wf[30].none.novice.active = 2;

        const initialWater = 500;
        agent.assets.p.storageFacility.currentInStorage[waterResourceType.name] = {
            resource: waterResourceType,
            quantity: initialWater,
        };
        agent.assets.p.storageFacility.current.volume = initialWater * waterResourceType.volumePerQuantity;
        agent.assets.p.storageFacility.current.mass = initialWater * waterResourceType.massPerQuantity;

        agent.assets.p.productionFacilities = [facilityA, facilityB];

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        const remaining = agent.assets.p.storageFacility.currentInStorage[waterResourceType.name]?.quantity ?? 0;
        expect(remaining).toBeGreaterThanOrEqual(0);

        expect(remaining).toBeLessThanOrEqual(initialWater);
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
        };

        agent.assets.p.productionFacilities = [facility];

        agent.assets.p.storageFacility.currentInStorage[constructionServiceResourceType.name] = {
            resource: constructionServiceResourceType,
            quantity: 80,
        };

        const gs = makeGameState(planet, [agent, gov]);
        constructionTick(gs, planet);

        expect(facility.construction).not.toBeNull();
        expect(facility.construction!.progress).toBe(50);
        const remaining =
            agent.assets.p.storageFacility.currentInStorage[constructionServiceResourceType.name]?.quantity ?? 0;
        expect(remaining).toBe(30);
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
        };

        agent.assets.p.productionFacilities = [facility];
        agent.assets.p.storageFacility.currentInStorage[constructionServiceResourceType.name] = {
            resource: constructionServiceResourceType,
            quantity: 20,
        };

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
        };

        agent.assets.p.productionFacilities = [facility];

        const gs = makeGameState(planet, [agent, gov]);
        constructionTick(gs, planet);

        expect(facility.construction).not.toBeNull();
        expect(facility.construction!.progress).toBe(10);
    });

    it('applies constructionTick to storageFacility and managementFacilities as well', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const mgmtFacility = makeManagementFacility(
            { none: 1 },
            { id: 'mgmt-under-construction', scale: 0, maxScale: 0 },
        );
        mgmtFacility.construction = {
            type: 'new',
            constructionTargetMaxScale: 2,
            totalConstructionServiceRequired: 60,
            maximumConstructionServiceConsumption: 30,
            progress: 0,
            lastTickInvestedConstructionServices: 0,
        };

        agent.assets.p.managementFacilities = [mgmtFacility];
        agent.assets.p.storageFacility.currentInStorage[constructionServiceResourceType.name] = {
            resource: constructionServiceResourceType,
            quantity: 30,
        };

        const gs = makeGameState(planet, [agent, gov]);
        constructionTick(gs, planet);

        expect(mgmtFacility.construction!.progress).toBe(30);
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
        };

        agent.assets.p.productionFacilities = [facility];
        agent.assets.p.storageFacility.currentInStorage[constructionServiceResourceType.name] = {
            resource: constructionServiceResourceType,
            quantity: 20,
        };

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
        expect(ev.message).toContain('Iron Mine');
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
        };

        agent.assets.p.productionFacilities = [facility];
        agent.assets.p.storageFacility.currentInStorage[constructionServiceResourceType.name] = {
            resource: constructionServiceResourceType,
            quantity: 20,
        };

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
        };

        agent.assets.p.productionFacilities = [f1, f2];
        agent.assets.p.storageFacility.currentInStorage[constructionServiceResourceType.name] = {
            resource: constructionServiceResourceType,
            quantity: 100,
        };

        const gs = makeGameState(planet, [agent, gov]);

        constructionTick(gs, planet);

        expect(gs.tickerEvents).toHaveLength(2);
        expect(gs.tickerEvents[0]!.id).toBe(1);
        expect(gs.tickerEvents[1]!.id).toBe(2);
    });
});

describe('productionTick — storage facility', () => {
    beforeEach(() => {
        seedRng(12345);
    });

    it('includes storage facility in worker allocation and populates lastTickResults', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        agent.assets.p.storageFacility = makeStorageFacility({
            planetId: 'p',
            id: 'storage-p',
            workerRequirement: { none: 1 },
            scale: 1,
        });

        const wf = agent.assets.p.workforceDemography;
        wf[30].none.novice.active = 2;

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        const results = agent.assets.p.storageFacility.lastTickResults;
        expect(results).toBeDefined();
        expect(results.overallEfficiency).toBeGreaterThan(0);
    });

    it('excludes storage facility under construction from productionTick', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        agent.assets.p.storageFacility = makeStorageFacility({
            planetId: 'p',
            id: 'storage-p',
            workerRequirement: { none: 1 },
            scale: 0,
            maxScale: 0,
            construction: {
                type: 'new',
                constructionTargetMaxScale: 1,
                totalConstructionServiceRequired: 100,
                maximumConstructionServiceConsumption: 50,
                progress: 0,
                lastTickInvestedConstructionServices: 0,
            },
        });

        const wf = agent.assets.p.workforceDemography;
        wf[30].none.novice.active = 1;

        const initialEfficiency = agent.assets.p.storageFacility.lastTickResults.overallEfficiency;

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(agent.assets.p.storageFacility.lastTickResults.overallEfficiency).toBe(initialEfficiency);
    });
});

describe('productionTick — management facility', () => {
    beforeEach(() => {
        seedRng(12345);
    });

    it('management facility consumes stored input and advances buffer', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const mgmtFacility = makeManagementFacility(
            { none: 1 },
            {
                id: 'mgmt-1',
                scale: 1,
                bufferPerTickPerScale: 10,
                maxBuffer: 100,
                buffer: 0,
                needs: [{ resource: waterResourceType, quantity: 5 }],
            },
        );

        agent.assets.p.managementFacilities = [mgmtFacility];
        agent.assets.p.storageFacility.currentInStorage[waterResourceType.name] = {
            resource: waterResourceType,
            quantity: 50,
        };
        agent.assets.p.storageFacility.current.volume += 50 * waterResourceType.volumePerQuantity;
        agent.assets.p.storageFacility.current.mass += 50 * waterResourceType.massPerQuantity;

        const wf = agent.assets.p.workforceDemography;
        wf[30].none.novice.active = 1;

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(mgmtFacility.lastTickResults.overallEfficiency).toBeGreaterThan(0);
        expect(mgmtFacility.buffer).toBeGreaterThan(0);
        expect(mgmtFacility.lastTickResults.lastConsumed[waterResourceType.name]).toBeGreaterThan(0);

        const remaining = agent.assets.p.storageFacility.currentInStorage[waterResourceType.name]?.quantity ?? 0;
        expect(remaining).toBeLessThan(50);
    });

    it('management facility does not advance buffer at zero efficiency', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const mgmtFacility = makeManagementFacility(
            { none: 1 },
            {
                id: 'mgmt-noworker',
                scale: 1,
                bufferPerTickPerScale: 10,
                maxBuffer: 100,
                buffer: 0,
                needs: [],
            },
        );

        agent.assets.p.managementFacilities = [mgmtFacility];

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(mgmtFacility.lastTickResults.overallEfficiency).toBe(0);
        expect(mgmtFacility.buffer).toBe(0);
    });

    it('management facility under construction is excluded from productionTick', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('test-company');

        const mgmtFacility = makeManagementFacility(
            { none: 1 },
            {
                id: 'mgmt-under-construction',
                scale: 0,
                maxScale: 0,
                buffer: 0,
                construction: {
                    type: 'new',
                    constructionTargetMaxScale: 1,
                    totalConstructionServiceRequired: 100,
                    maximumConstructionServiceConsumption: 50,
                    progress: 0,
                    lastTickInvestedConstructionServices: 0,
                },
            },
        );

        agent.assets.p.managementFacilities = [mgmtFacility];
        const wf = agent.assets.p.workforceDemography;
        wf[30].none.novice.active = 1;

        const initialEfficiency = mgmtFacility.lastTickResults.overallEfficiency;

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(mgmtFacility.lastTickResults.overallEfficiency).toBe(initialEfficiency);
        expect(mgmtFacility.buffer).toBe(0);
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
        const shipType = makeTestShipType();

        const shipyard = makeShipConstructionFacility({ secondary: 1 }, { id: 'sy-1', scale: 9, shipType });

        agent.assets.p.shipConstructionFacilities = [shipyard];
        agent.assets.p.storageFacility.currentInStorage[steelResourceType.name] = {
            resource: steelResourceType,
            quantity: 60,
        };
        agent.assets.p.storageFacility.current.volume = 60 * steelResourceType.volumePerQuantity;
        agent.assets.p.storageFacility.current.mass = 60 * steelResourceType.massPerQuantity;

        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.novice.active = 9;

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(shipyard.lastTickResults.overallEfficiency).toBeCloseTo(1, 5);
        const consumed = shipyard.lastTickResults.lastConsumed[steelResourceType.name] ?? 0;
        expect(consumed).toBeCloseTo(30, 5);

        const remaining = agent.assets.p.storageFacility.currentInStorage[steelResourceType.name]?.quantity ?? 0;
        expect(remaining).toBeCloseTo(30, 5);
    });

    it('records zero consumption and zero efficiency when no workers are available', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('builder');
        const shipType = makeTestShipType();

        const shipyard = makeShipConstructionFacility({ secondary: 1 }, { id: 'sy-zero', scale: 1, shipType });
        agent.assets.p.shipConstructionFacilities = [shipyard];
        agent.assets.p.storageFacility.currentInStorage[steelResourceType.name] = {
            resource: steelResourceType,
            quantity: 100,
        };

        const gs = makeGameState(planet, [agent, gov]);
        productionTick(gs, planet);

        expect(shipyard.lastTickResults.overallEfficiency).toBe(0);
        expect(shipyard.lastTickResults.lastConsumed[steelResourceType.name]).toBe(0);

        const remaining = agent.assets.p.storageFacility.currentInStorage[steelResourceType.name]?.quantity ?? 0;
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
                },
            },
        );

        agent.assets.p.shipConstructionFacilities = [shipyard];
        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.novice.active = 1;
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
        wf[30].secondary.novice.active = 1;

        const gs = makeGameState(planet, [agent, gov], 10);

        productionTick(gs, planet);

        expect(gs.tickerEvents).toHaveLength(1);
        const ev = gs.tickerEvents[0]!;
        expect(ev.category).toBe('shipCompleted');
        expect(ev.planetId).toBe(planet.id);
        expect(ev.agentId).toBe(agent.id);
        expect(ev.tick).toBe(10);
        expect(ev.message).toContain('SS Test');
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
        wf[30].secondary.novice.active = 1;

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
        const wf = agent.assets.p.workforceDemography;

        wf[30].secondary.novice.active = 1;

        wf[30].secondary.novice.workforceExperience = 40;

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
        expect(recorded!.lastTickResults.overallEfficiency).toBeCloseTo(0.4875);

        const storedIron = agent.assets.p.storageFacility.currentInStorage['Iron Ore']?.quantity ?? 0;
        expect(storedIron).toBeGreaterThan(950);
        expect(storedIron).toBeLessThan(1000);
    });

    it('workers with zero XP produce less than those with high XP (same headcount)', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('no-xp-company');

        const facility = makeProductionFacility({ secondary: 2 }, { scale: 2 });
        facility.id = 'no-xp-fac';
        facility.needs = [{ resource: ironOreDepositResourceType, quantity: 1000 }];
        facility.produces = [{ resource: ironOreResourceType, quantity: 1000 }];

        agent.assets.p.productionFacilities = [facility];
        const wf = agent.assets.p.workforceDemography;
        wf[30].secondary.novice.active = 1;

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
        expect(recorded!.lastTickResults.overallEfficiency).toBeCloseTo(0.25);

        const storedIron = agent.assets.p.storageFacility.currentInStorage['Iron Ore']?.quantity ?? 0;
        expect(storedIron).toBeGreaterThan(450);
        expect(storedIron).toBeLessThan(550);
    });

    it('XP is averaged across all workers in the same edu+skill category', () => {
        const { planet, gov } = makePlanetWithPopulation({});
        const agent = makeAgent('mixed-xp-company');

        const facility = makeProductionFacility({ secondary: 2 }, { scale: 2 });
        facility.id = 'mixed-xp-fac';
        facility.needs = [{ resource: ironOreDepositResourceType, quantity: 1000 }];
        facility.produces = [{ resource: ironOreResourceType, quantity: 1000 }];

        agent.assets.p.productionFacilities = [facility];
        const wf = agent.assets.p.workforceDemography;

        wf[30].secondary.novice.active = 1;
        wf[30].secondary.novice.workforceExperience = 0;
        wf[50].secondary.novice.active = 1;
        wf[50].secondary.novice.workforceExperience = 80;

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

        expect(recorded!.lastTickResults.overallEfficiency).toBeCloseTo(0.975);

        const storedIron = agent.assets.p.storageFacility.currentInStorage['Iron Ore']?.quantity ?? 0;
        expect(storedIron).toBeGreaterThan(1900);
        expect(storedIron).toBeLessThan(2000);
    });
});
