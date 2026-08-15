import { describe, it, expect } from 'vitest';

import { automaticWageAdjustment, automaticWorkerAllocation } from './automaticWorkerAllocation';
import { makeAgent, makePlanetWithPopulation, makeProductionFacility, agentMap } from '../utils/testHelper';
import { NOTICE_PERIOD_MONTHS } from '../constants';

describe('updateAllocatedWorkers', () => {
    it('sets allocatedWorkers to buffered requirement x scale when no prior tick results', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000, primary: 20000 });
        const agent = makeAgent();
        const fac = makeProductionFacility({ none: 100, primary: 50 }, { scale: 10 });
        agent.assets.p.productionFacilities = [fac];
        agent.assets.p.totalSlotCapacity = { none: 1000, primary: 500, secondary: 0, tertiary: 0 };

        automaticWorkerAllocation(agentMap(agent), planet);

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
        agent.assets.p.totalSlotCapacity = { none: 6400, primary: 3200, secondary: 0, tertiary: 0 };

        automaticWorkerAllocation(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(6720);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(3360);
    });

    it('uses exact+total usage from lastTickResults to compute targets', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000, primary: 50000 });
        const agent = makeAgent();
        const fac = makeProductionFacility({ none: 100 }, { scale: 10 });

        fac.lastTickResults.totalUsedByEdu = { none: 900, primary: 0, secondary: 0, tertiary: 0 };
        fac.lastTickResults.exactUsedByEdu = { none: 900, primary: 0, secondary: 0, tertiary: 0 };
        agent.assets.p.productionFacilities = [fac];
        agent.assets.p.totalSlotCapacity = { none: 1000, primary: 0, secondary: 0, tertiary: 0 };

        automaticWorkerAllocation(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(1050);
    });

    it('reduces target when workers were fully sufficient last tick', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();
        const fac = makeProductionFacility({ none: 100 }, { scale: 10 });

        fac.lastTickResults.totalUsedByEdu = { none: 1000, primary: 0, secondary: 0, tertiary: 0 };
        fac.lastTickResults.exactUsedByEdu = { none: 1000, primary: 0, secondary: 0, tertiary: 0 };
        agent.assets.p.productionFacilities = [fac];
        agent.assets.p.totalSlotCapacity = { none: 1000, primary: 0, secondary: 0, tertiary: 0 };

        automaticWorkerAllocation(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(1050);
    });

    it('allocates overqualified workers to their own tier and adds deficit for the unfilled tier', () => {
        const { planet } = makePlanetWithPopulation({ none: 0, primary: 50000 });
        const agent = makeAgent();
        const fac = makeProductionFacility({ none: 100 }, { scale: 10 });

        fac.lastTickResults.totalUsedByEdu = { none: 0, primary: 1000, secondary: 0, tertiary: 0 };
        fac.lastTickResults.exactUsedByEdu = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
        agent.assets.p.productionFacilities = [fac];
        agent.assets.p.totalSlotCapacity = { none: 1000, primary: 0, secondary: 0, tertiary: 0 };

        automaticWorkerAllocation(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(1050);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(1050);
    });

    it('cascades unfillable demand to the next higher education level', () => {
        const { planet } = makePlanetWithPopulation({ none: 0, primary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ none: 100, primary: 50 }, { scale: 10 })];
        agent.assets.p.totalSlotCapacity = { none: 1000, primary: 500, secondary: 0, tertiary: 0 };

        automaticWorkerAllocation(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(1050);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(525);
    });

    it('never reduces allocation below zero', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [];

        automaticWorkerAllocation(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(0);
    });

    it('accounts for departing workers via DEPARTING_EFFICIENCY in the worker pool', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeProductionFacility({ none: 100 }, { scale: 10 })];
        agent.assets.p.totalSlotCapacity = { none: 1000, primary: 0, secondary: 0, tertiary: 0 };

        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.active = 900;
        wf[30].none.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1] = 100;
        wf[30].none.departingFired[NOTICE_PERIOD_MONTHS - 1] = 100;

        automaticWorkerAllocation(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBe(1050);
    });
});

describe('automaticWageAdjustment', () => {
    it('raises the wage when profitable and understaffed', () => {
        const { planet } = makePlanetWithPopulation({});
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        for (const edu of ['none', 'primary', 'secondary', 'tertiary'] as const) {
            wf[30][edu].active = 10;
            agent.assets.p.allocatedWorkers[edu] = 100;
            agent.assets.p.wagePerEdu[edu] = 100;
        }
        agent.assets.p.lastMonthAcc.revenue = 100_000;

        automaticWageAdjustment(agentMap(agent), planet);

        expect(agent.assets.p.wagePerEdu.none).toBeGreaterThan(100);
    });

    it('lowers the wage when unprofitable', () => {
        const { planet } = makePlanetWithPopulation({});
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        for (const edu of ['none', 'primary', 'secondary', 'tertiary'] as const) {
            wf[30][edu].active = 10;
            agent.assets.p.wagePerEdu[edu] = 100;
        }

        automaticWageAdjustment(agentMap(agent), planet);

        expect(agent.assets.p.wagePerEdu.none).toBeLessThan(100);
    });

    it('raises the wage when fully staffed but turnover is too high', () => {
        const { planet } = makePlanetWithPopulation({});
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        for (const edu of ['none', 'primary', 'secondary', 'tertiary'] as const) {
            wf[30][edu].active = 100;
            agent.assets.p.allocatedWorkers[edu] = 100;
            agent.assets.p.wagePerEdu[edu] = 100;
            wf[30][edu].voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1] = 50;
        }
        agent.assets.p.lastMonthAcc.revenue = 100_000;

        automaticWageAdjustment(agentMap(agent), planet);

        expect(agent.assets.p.wagePerEdu.none).toBeGreaterThan(100);
    });

    it('lowers the wage when fully staffed with too little turnover', () => {
        const { planet } = makePlanetWithPopulation({});
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        for (const edu of ['none', 'primary', 'secondary', 'tertiary'] as const) {
            wf[30][edu].active = 100;
            agent.assets.p.allocatedWorkers[edu] = 100;
            agent.assets.p.wagePerEdu[edu] = 100;
        }
        agent.assets.p.lastMonthAcc.revenue = 100_000;

        automaticWageAdjustment(agentMap(agent), planet);

        expect(agent.assets.p.wagePerEdu.none).toBeLessThan(100);
    });
});
