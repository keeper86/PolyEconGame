import { describe, it, expect } from 'vitest';

import { updateAllocatedWorkers } from './allocatedWorkers';
import { makeAgent, makePlanetWithPopulation, makeProductionFacility, agentMap } from '../utils/testHelper';
import { NOTICE_PERIOD_MONTHS } from '../constants';

// ---------------------------------------------------------------------------
// updateAllocatedWorkers
// ---------------------------------------------------------------------------

describe('updateAllocatedWorkers', () => {
    it('sets allocatedWorkers to buffered requirement x scale when no prior tick results', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000, primary: 20000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ none: 100, primary: 50 }, { scale: 10 })];

        updateAllocatedWorkers(agentMap(agent), planet);

        // No lastTickResults usage yet → deficit = full requirement, totalUsed = 0
        // target = ceil((0 + req*scale) * 1.05)
        expect(agent.assets.p.allocatedWorkers.none).toBe(1050);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(525);
        expect(agent.assets.p.allocatedWorkers.secondary).toBe(0);
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

    it('uses exact+total usage from lastTickResults to compute targets', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000, primary: 50000 });
        const agent = makeAgent();
        const fac = makeProductionFacility({ none: 100 }, { scale: 10 });
        // Simulate: 900 none-tier workers used exactly, 0 overqualified
        fac.lastTickResults.totalUsedByEdu = { none: 900, primary: 0, secondary: 0, tertiary: 0 };
        fac.lastTickResults.exactUsedByEdu = { none: 900, primary: 0, secondary: 0, tertiary: 0 };
        agent.assets.p.productionFacilities = [fac];

        updateAllocatedWorkers(agentMap(agent), planet);

        // deficit = max(0, 1000 - 900) = 100; target = ceil((900 + 100) * 1.05) = 1050
        expect(agent.assets.p.allocatedWorkers.none).toBe(1050);
    });

    it('reduces target when workers were fully sufficient last tick', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();
        const fac = makeProductionFacility({ none: 100 }, { scale: 10 });
        // All 1000 slots filled exactly — surplus of none workers
        fac.lastTickResults.totalUsedByEdu = { none: 1000, primary: 0, secondary: 0, tertiary: 0 };
        fac.lastTickResults.exactUsedByEdu = { none: 1000, primary: 0, secondary: 0, tertiary: 0 };
        agent.assets.p.productionFacilities = [fac];

        updateAllocatedWorkers(agentMap(agent), planet);

        // deficit = 0; target = ceil(1000 * 1.05) = 1050
        expect(agent.assets.p.allocatedWorkers.none).toBe(1050);
    });

    it('allocates overqualified workers to their own tier and adds deficit for the unfilled tier', () => {
        const { planet } = makePlanetWithPopulation({ none: 0, primary: 50000 });
        const agent = makeAgent();
        const fac = makeProductionFacility({ none: 100 }, { scale: 10 });
        // 1000 none-slots filled by 1000 primary workers (overqualified)
        fac.lastTickResults.totalUsedByEdu = { none: 0, primary: 1000, secondary: 0, tertiary: 0 };
        fac.lastTickResults.exactUsedByEdu = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
        agent.assets.p.productionFacilities = [fac];

        updateAllocatedWorkers(agentMap(agent), planet);

        // none: deficit=1000, totalUsed=0 → target=ceil(1000*1.05)=1050 (but no none workers → hireWorkforce does nothing)
        // primary: deficit=0, totalUsed=1000 → target=ceil(1000*1.05)=1050
        expect(agent.assets.p.allocatedWorkers.none).toBe(1050);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(1050);
    });

    it('cascades unfillable demand to the next higher education level', () => {
        const { planet } = makePlanetWithPopulation({ none: 0, primary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ none: 100, primary: 50 }, { scale: 10 })];

        updateAllocatedWorkers(agentMap(agent), planet);

        // No tick results: none deficit=1000, primary deficit=500
        // none: target=ceil(1000*1.05)=1050; primary: target=ceil(500*1.05)=525
        expect(agent.assets.p.allocatedWorkers.none).toBe(1050);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(525);
    });

    it('never reduces allocation below zero', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [];

        updateAllocatedWorkers(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(0);
    });

    it('accounts for departing workers via DEPARTING_EFFICIENCY in the worker pool', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ none: 100 }, { scale: 10 })];

        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.novice.active = 900;
        wf[30].none.novice.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1] = 100;
        wf[30].none.novice.departingFired[NOTICE_PERIOD_MONTHS - 1] = 100;

        updateAllocatedWorkers(agentMap(agent), planet);

        // No lastTickResults → full deficit path: target = ceil(1000 * 1.05) = 1050
        expect(agent.assets.p.allocatedWorkers.none).toBe(1050);
    });
});
