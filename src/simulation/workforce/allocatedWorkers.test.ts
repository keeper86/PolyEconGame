import { describe, it, expect } from 'vitest';

import { updateAllocatedWorkers } from './allocatedWorkers';
import { NOTICE_PERIOD_MONTHS } from './laborMarketTick';
import { makeAgent, makePlanetWithPopulation, makeProductionFacility, agentMap } from '../utils/testHelper';

// ---------------------------------------------------------------------------
// updateAllocatedWorkers
// ---------------------------------------------------------------------------

describe('updateAllocatedWorkers', () => {
    it('sets allocatedWorkers to buffered requirement x scale when population has enough workers', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000, primary: 20000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ none: 100, primary: 50 }, { scale: 10 })];

        updateAllocatedWorkers(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(1050);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(525);
        expect(agent.assets.p.allocatedWorkers.secondary).toBe(0);
    });

    it('cascades unfillable demand to the next higher education level', () => {
        const { planet } = makePlanetWithPopulation({ none: 0, primary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ none: 100, primary: 50 }, { scale: 10 })];

        updateAllocatedWorkers(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(0);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(1575);
    });

    it('cascades through multiple levels when intermediate levels are also empty', () => {
        const { planet } = makePlanetWithPopulation({ none: 0, primary: 0, secondary: 10000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ none: 50, primary: 30 }, { scale: 10 })];

        updateAllocatedWorkers(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(0);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(0);
        expect(agent.assets.p.allocatedWorkers.secondary).toBe(840);
    });

    it('partially fills at a level and cascades the remainder', () => {
        const { planet } = makePlanetWithPopulation({ none: 200, primary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ none: 100 }, { scale: 10 })];

        updateAllocatedWorkers(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(200);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(850);
    });

    it('accounts for already-hired workers in supply calculation', () => {
        const { planet } = makePlanetWithPopulation({ none: 0, primary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ none: 100 }, { scale: 10 })];
        // Place 600 active workers at age 30, none/novice
        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.novice.active = 600;

        updateAllocatedWorkers(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(600);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(450);
    });

    it('aggregates requirements from multiple facilities', () => {
        const { planet } = makePlanetWithPopulation({ none: 100000, primary: 100000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [
            makeProductionFacility({ none: 60, primary: 30 }, { scale: 100 }),
            makeProductionFacility({ none: 4, primary: 2 }, { scale: 100, id: 'facility-2' }),
        ];

        updateAllocatedWorkers(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(6720);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(3360);
    });

    it('uses feedback-based allocation when unusedWorkers is available (surplus)', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ none: 100 }, { scale: 10 })];

        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.novice.active = 1000;
        agent.assets.p.workerFeedback = {
            unusedWorkerFraction: 0.03,
            unusedWorkers: { none: 30, primary: 0, secondary: 0, tertiary: 0 },
        };

        updateAllocatedWorkers(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(1019);
    });

    it('uses feedback-based allocation when unusedWorkers is negative (shortage)', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ none: 100 }, { scale: 10 })];

        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.novice.active = 900;
        agent.assets.p.workerFeedback = {
            unusedWorkerFraction: 0,
            unusedWorkers: { none: -50, primary: 0, secondary: 0, tertiary: 0 },
        };

        updateAllocatedWorkers(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(998);
    });

    it('never reduces allocation below zero', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [];

        agent.assets.p.workerFeedback = {
            unusedWorkerFraction: 0.5,
            unusedWorkers: { none: 100, primary: 0, secondary: 0, tertiary: 0 },
        };

        updateAllocatedWorkers(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(0);
    });

    it('redistributes overqualified consumption back to the job slot level', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000, primary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ none: 100, primary: 50 }, { scale: 10 })];

        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.novice.active = 500;
        wf[30].primary.novice.active = 1000;
        agent.assets.p.workerFeedback = {
            unusedWorkerFraction: 0,
            unusedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
            overqualifiedMatrix: { none: { primary: 500 } },
        };

        updateAllocatedWorkers(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(1050);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(525);
    });

    it('redistributes overqualified consumption and cascades overflow when population is short', () => {
        const { planet } = makePlanetWithPopulation({ none: 200, primary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ none: 100 }, { scale: 10 })];

        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.novice.active = 200;
        wf[30].primary.novice.active = 800;
        agent.assets.p.workerFeedback = {
            unusedWorkerFraction: 0,
            unusedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
            overqualifiedMatrix: { none: { primary: 800 } },
        };

        updateAllocatedWorkers(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(400);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(650);
    });

    it('excludes fired workers from the effective pool in feedback path', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ none: 100 }, { scale: 10 })];

        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.novice.active = 900;
        wf[30].none.novice.departing[NOTICE_PERIOD_MONTHS - 1] = 100;
        wf[30].none.novice.departingFired[NOTICE_PERIOD_MONTHS - 1] = 100;
        agent.assets.p.workerFeedback = {
            unusedWorkerFraction: 0,
            unusedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
        };

        updateAllocatedWorkers(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(945);
    });

    it('excludes fired workers from pool while keeping voluntary quitters', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ none: 100 }, { scale: 10 })];

        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.novice.active = 800;
        wf[30].none.novice.departing[NOTICE_PERIOD_MONTHS - 1] = 150;
        wf[30].none.novice.departingFired[NOTICE_PERIOD_MONTHS - 1] = 50;
        agent.assets.p.workerFeedback = {
            unusedWorkerFraction: 0,
            unusedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
        };

        updateAllocatedWorkers(agentMap(agent), planet);

        // effective pool = 800 + floor((150-50) * 0.5) = 800 + 50 = 850
        // consumed = 850 - 0 = 850
        // target = ceil(850 * 1.05) = 893
        expect(agent.assets.p.allocatedWorkers.none).toBe(893);
    });

    it('recovers from zero active workers when facilities still declare demand (facility floor)', () => {
        const { planet } = makePlanetWithPopulation({ tertiary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ tertiary: 100 }, { scale: 10 })];

        const wf = agent.assets.p.workforceDemography!;
        // All workers in departing pipeline, all fired -> pool is 0
        wf[30].tertiary.novice.departing[2] = 500;
        wf[30].tertiary.novice.departingFired[2] = 500;
        agent.assets.p.workerFeedback = {
            unusedWorkerFraction: 0,
            unusedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
        };

        updateAllocatedWorkers(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.tertiary).toBe(1050);
    });

    it('facility floor does not override positive feedback target', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ none: 100 }, { scale: 10 })];

        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.novice.active = 1200;
        agent.assets.p.workerFeedback = {
            unusedWorkerFraction: 0,
            unusedWorkers: { none: -100, primary: 0, secondary: 0, tertiary: 0 },
        };

        updateAllocatedWorkers(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(1365);
    });

    it('recovers even when all fired workers have fully departed (pool = 0, unused = 0)', () => {
        const { planet } = makePlanetWithPopulation({ tertiary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ tertiary: 50 }, { scale: 10 })];

        agent.assets.p.workerFeedback = {
            unusedWorkerFraction: 0,
            unusedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
        };

        updateAllocatedWorkers(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.tertiary).toBe(525);
    });
});
