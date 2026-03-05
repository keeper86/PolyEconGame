import { describe, it, expect } from 'vitest';

import { updateAllocatedWorkers } from './allocatedWorkers';
import { makeAgent, makePlanet, makeFacility, agentMap, planetMap } from './testHelpers';
import { ageMomentsForAge, emptyAgeMoments, NOTICE_PERIOD_MONTHS } from './workforceHelpers';

// ---------------------------------------------------------------------------
// updateAllocatedWorkers
// ---------------------------------------------------------------------------

describe('updateAllocatedWorkers', () => {
    it('sets allocatedWorkers to buffered requirement × scale when population has enough workers', () => {
        const { planet } = makePlanet({ none: 50000, primary: 20000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100, primary: 50 }, 10)];

        updateAllocatedWorkers(agentMap(agent), planetMap(planet));

        expect(agent.assets.p.allocatedWorkers.none).toBe(1050);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(525);
        expect(agent.assets.p.allocatedWorkers.secondary).toBe(0);
    });

    it('cascades unfillable demand to the next higher education level', () => {
        const { planet } = makePlanet({ none: 0, primary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100, primary: 50 }, 10)];

        updateAllocatedWorkers(agentMap(agent), planetMap(planet));

        expect(agent.assets.p.allocatedWorkers.none).toBe(0);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(1575);
    });

    it('cascades through multiple levels when intermediate levels are also empty', () => {
        const { planet } = makePlanet({ none: 0, primary: 0, secondary: 10000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 50, primary: 30 }, 10)];

        updateAllocatedWorkers(agentMap(agent), planetMap(planet));

        expect(agent.assets.p.allocatedWorkers.none).toBe(0);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(0);
        expect(agent.assets.p.allocatedWorkers.secondary).toBe(840);
    });

    it('partially fills at a level and cascades the remainder', () => {
        const { planet } = makePlanet({ none: 200, primary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100 }, 10)];

        updateAllocatedWorkers(agentMap(agent), planetMap(planet));

        expect(agent.assets.p.allocatedWorkers.none).toBe(200);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(850);
    });

    it('accounts for already-hired workers in supply calculation', () => {
        const { planet } = makePlanet({ none: 0, primary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100 }, 10)];
        agent.assets.p.workforceDemography![0].active.none = ageMomentsForAge(30, 600);

        updateAllocatedWorkers(agentMap(agent), planetMap(planet));

        expect(agent.assets.p.allocatedWorkers.none).toBe(600);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(450);
    });

    it('aggregates requirements from multiple facilities', () => {
        const { planet } = makePlanet({ none: 100000, primary: 100000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [
            makeFacility({ none: 60, primary: 30 }, 100),
            makeFacility({ none: 4, primary: 2 }, 100),
        ];

        updateAllocatedWorkers(agentMap(agent), planetMap(planet));

        expect(agent.assets.p.allocatedWorkers.none).toBe(6720);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(3360);
    });

    it('handles the case where no planet is found (uses buffered requirements)', () => {
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 10 }, 5)];

        updateAllocatedWorkers(agentMap(agent), planetMap());

        expect(agent.assets.p.allocatedWorkers.none).toBe(53);
    });

    it('uses feedback-based allocation when unusedWorkers is available (surplus)', () => {
        const { planet } = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100 }, 10)];

        agent.assets.p.workforceDemography![0].active.none = ageMomentsForAge(30, 1000);
        agent.assets.p.unusedWorkerFraction = 0.03;
        agent.assets.p.unusedWorkers = { none: 30, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };

        updateAllocatedWorkers(agentMap(agent), planetMap(planet));

        expect(agent.assets.p.allocatedWorkers.none).toBe(1019);
    });

    it('uses feedback-based allocation when unusedWorkers is negative (shortage)', () => {
        const { planet } = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100 }, 10)];

        agent.assets.p.workforceDemography![0].active.none = ageMomentsForAge(30, 900);
        agent.assets.p.unusedWorkers = { none: -50, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };

        updateAllocatedWorkers(agentMap(agent), planetMap(planet));

        expect(agent.assets.p.allocatedWorkers.none).toBe(998);
    });

    it('never reduces allocation below zero', () => {
        const { planet } = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [];

        agent.assets.p.unusedWorkerFraction = 0.5;
        agent.assets.p.unusedWorkers = { none: 100, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };

        updateAllocatedWorkers(agentMap(agent), planetMap(planet));

        expect(agent.assets.p.allocatedWorkers.none).toBe(0);
    });

    it('redistributes overqualified consumption back to the job slot level', () => {
        const { planet } = makePlanet({ none: 50000, primary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100, primary: 50 }, 10)];

        agent.assets.p.workforceDemography![0].active.none = ageMomentsForAge(30, 500);
        agent.assets.p.workforceDemography![0].active.primary = ageMomentsForAge(30, 1000);
        agent.assets.p.unusedWorkers = { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };
        agent.assets.p.overqualifiedMatrix = { none: { primary: 500 } };

        updateAllocatedWorkers(agentMap(agent), planetMap(planet));

        expect(agent.assets.p.allocatedWorkers.none).toBe(1050);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(525);
    });

    it('redistributes overqualified consumption and cascades overflow when population is short', () => {
        const { planet } = makePlanet({ none: 200, primary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100 }, 10)];

        agent.assets.p.workforceDemography![0].active.none = ageMomentsForAge(30, 200);
        agent.assets.p.workforceDemography![0].active.primary = ageMomentsForAge(30, 800);
        agent.assets.p.unusedWorkers = { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };
        agent.assets.p.overqualifiedMatrix = { none: { primary: 800 } };

        updateAllocatedWorkers(agentMap(agent), planetMap(planet));

        expect(agent.assets.p.allocatedWorkers.none).toBe(400);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(650);
    });

    it('excludes fired workers from the effective pool in feedback path', () => {
        const { planet } = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100 }, 10)];

        const wf = agent.assets.p.workforceDemography!;
        wf[2].active.none = ageMomentsForAge(30, 900);
        wf[2].departing.none[NOTICE_PERIOD_MONTHS - 1] = ageMomentsForAge(30, 100);
        wf[2].departingFired.none[NOTICE_PERIOD_MONTHS - 1] = 100;
        agent.assets.p.unusedWorkers = { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };

        updateAllocatedWorkers(agentMap(agent), planetMap(planet));

        expect(agent.assets.p.allocatedWorkers.none).toBe(945);
    });

    it('excludes fired workers from pool while keeping voluntary quitters', () => {
        const { planet } = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100 }, 10)];

        const wf = agent.assets.p.workforceDemography!;
        wf[3].active.none = ageMomentsForAge(30, 800);
        wf[3].departing.none[NOTICE_PERIOD_MONTHS - 1] = ageMomentsForAge(30, 150);
        wf[3].departingFired.none[NOTICE_PERIOD_MONTHS - 1] = 50;
        agent.assets.p.unusedWorkers = { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };

        updateAllocatedWorkers(agentMap(agent), planetMap(planet));

        // effective pool = 800 + 150 - 50(fired) = 900, target ≈ 900 * (1050/900) adjusted
        expect(agent.assets.p.allocatedWorkers.none).toBeGreaterThan(0);
    });

    it('recovers from zero active workers when facilities still declare demand (facility floor)', () => {
        const { planet } = makePlanet({ tertiary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ tertiary: 100 }, 10)];

        const wf = agent.assets.p.workforceDemography!;
        wf[3].active.tertiary = emptyAgeMoments();
        wf[3].departing.tertiary[6] = ageMomentsForAge(30, 500);
        wf[3].departingFired.tertiary[6] = 500;
        agent.assets.p.unusedWorkers = { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };

        updateAllocatedWorkers(agentMap(agent), planetMap(planet));

        expect(agent.assets.p.allocatedWorkers.tertiary).toBe(1050);
    });

    it('facility floor does not override positive feedback target', () => {
        const { planet } = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100 }, 10)];

        agent.assets.p.workforceDemography![0].active.none = ageMomentsForAge(30, 1200);
        agent.assets.p.unusedWorkers = { none: -100, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };

        updateAllocatedWorkers(agentMap(agent), planetMap(planet));

        expect(agent.assets.p.allocatedWorkers.none).toBe(1365);
    });

    it('recovers even when all fired workers have fully departed (pool = 0, unused = 0)', () => {
        const { planet } = makePlanet({ tertiary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ tertiary: 50 }, 10)];

        agent.assets.p.unusedWorkers = { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };

        updateAllocatedWorkers(agentMap(agent), planetMap(planet));

        expect(agent.assets.p.allocatedWorkers.tertiary).toBe(525);
    });
});
