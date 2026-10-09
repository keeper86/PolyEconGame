import { beforeEach, describe, it, expect } from 'vitest';

import { automaticWageAdjustment, automaticWorkerAllocation } from './automaticWorkerAllocation';
import { setFireRateLimitPerMonth, setHireFlowMultiplier } from './hireWorkforce';
import { makeAgent, makePlanetWithPopulation, makeProductionFacility, agentMap } from '../utils/testHelper';
import { MAX_WAGE, MIN_WAGE, NOTICE_PERIOD_MONTHS } from '../constants';

beforeEach(() => {
    setHireFlowMultiplier(Number.POSITIVE_INFINITY);
    setFireRateLimitPerMonth(Number.POSITIVE_INFINITY);
});

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

    it('targets each tier from its own deficit, counting overqualified workers as supplied', () => {
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

    it('does not inflate higher-tier targets beyond their own deficit', () => {
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

    it('sets the target straight to the buffered requirement instead of throttling it', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();
        const fac = makeProductionFacility({ none: 100 }, { scale: 10 });
        fac.lastTickResults.totalUsedByEdu = { none: 100, primary: 0, secondary: 0, tertiary: 0 };
        fac.lastTickResults.exactUsedByEdu = { none: 100, primary: 0, secondary: 0, tertiary: 0 };
        agent.assets.p.productionFacilities = [fac];
        agent.assets.p.totalSlotCapacity = { none: 100000, primary: 0, secondary: 0, tertiary: 0 };
        agent.assets.p.allocatedWorkers = { none: 0, primary: 0, secondary: 0, tertiary: 0 };

        automaticWorkerAllocation(agentMap(agent), planet);

        expect(agent.assets.p.allocatedWorkers.none).toBeGreaterThan(100000);
    });
});

describe('automaticWageAdjustment', () => {
    it('absorbs a low-tier shortage by substitution instead of raising its wage', () => {
        const { planet } = makePlanetWithPopulation({});
        const agent = makeAgent();
        agent.assets.p.wagePerEdu = { none: 100, primary: 100, secondary: 100, tertiary: 100 };
        agent.assets.p.totalSlotCapacity.none = 100;

        automaticWageAdjustment(agentMap(agent), planet);

        expect(agent.assets.p.wagePerEdu.none).toBe(agent.assets.p.wagePerEdu.primary);
    });

    it('raises the wage of the top tier when short of workers', () => {
        const { planet } = makePlanetWithPopulation({});
        const agent = makeAgent();
        agent.assets.p.wagePerEdu = { none: 100, primary: 100, secondary: 100, tertiary: 100 };
        agent.assets.p.totalSlotCapacity.tertiary = 100;

        automaticWageAdjustment(agentMap(agent), planet);

        expect(agent.assets.p.wagePerEdu.tertiary).toBeGreaterThan(100);
    });

    it('does not treat overqualified slot-filling as a shortage', () => {
        const { planet } = makePlanetWithPopulation({});
        const agent = makeAgent();
        agent.assets.p.wagePerEdu = { none: 100, primary: 100, secondary: 100, tertiary: 100 };
        agent.assets.p.totalSlotCapacity.none = 100;

        const fac = makeProductionFacility({ none: 100 }, { scale: 10 });
        fac.lastTickResults.totalUsedByEdu = { none: 0, primary: 100, secondary: 0, tertiary: 0 };
        fac.lastTickResults.exactUsedByEdu = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
        fac.lastTickResults.overqualifiedWorkers = { none: { primary: 100 } };
        agent.assets.p.productionFacilities = [fac];

        automaticWageAdjustment(agentMap(agent), planet);

        expect(agent.assets.p.wagePerEdu.none).toBeLessThanOrEqual(100);
    });

    it('relaxes the wage toward the floor when slots are filled and the firm cannot afford it', () => {
        const { planet } = makePlanetWithPopulation({});
        const agent = makeAgent();
        agent.assets.p.wagePerEdu = { none: 100, primary: 100, secondary: 100, tertiary: 100 };
        agent.assets.p.totalSlotCapacity.none = 100;
        agent.assets.p.workforceDemography[30].none.active = 100;

        const fac = makeProductionFacility({ none: 100 }, { scale: 10 });
        fac.lastTickResults.totalUsedByEdu = { none: 100, primary: 0, secondary: 0, tertiary: 0 };
        fac.lastTickResults.exactUsedByEdu = { none: 100, primary: 0, secondary: 0, tertiary: 0 };
        agent.assets.p.productionFacilities = [fac];

        agent.assets.p.lastMonthAcc.revenue = 50;
        agent.assets.p.lastMonthAcc.purchases = 100;
        agent.assets.p.lastMonthAcc.claimPayments = 0;
        agent.assets.p.lastMonthAcc.totalWorkersTicks = 100;

        automaticWageAdjustment(agentMap(agent), planet);

        expect(agent.assets.p.wagePerEdu.none).toBeLessThan(100);
    });

    it('freezes an over-ceiling wage instead of raising it, because the upward push is damped to zero', () => {
        const { planet } = makePlanetWithPopulation({});
        const agent = makeAgent();
        agent.assets.p.wagePerEdu = { none: 100, primary: 100, secondary: 100, tertiary: 100 };
        agent.assets.p.totalSlotCapacity.tertiary = 100;
        agent.assets.p.lastMonthAcc.revenue = 1000;
        agent.assets.p.lastMonthAcc.purchases = 0;
        agent.assets.p.lastMonthAcc.claimPayments = 0;
        agent.assets.p.lastMonthAcc.totalWorkersTicks = 100;

        for (let month = 0; month < 200; month++) {
            automaticWageAdjustment(agentMap(agent), planet);
        }

        expect(agent.assets.p.wagePerEdu.tertiary).toBe(100);
    });

    it('never lets an upward push carry the wage past the zero-profit ceiling', () => {
        const { planet } = makePlanetWithPopulation({});
        const agent = makeAgent();
        agent.assets.p.wagePerEdu = { none: 5, primary: 5, secondary: 5, tertiary: 5 };
        agent.assets.p.totalSlotCapacity.tertiary = 1000;
        agent.assets.p.workforceDemography[30].tertiary.active = 1000;
        agent.assets.p._monthlyVoluntaryQuits = { none: 0, primary: 0, secondary: 0, tertiary: 1000 };
        agent.assets.p.lastMonthAcc.revenue = 1000;
        agent.assets.p.lastMonthAcc.purchases = 0;
        agent.assets.p.lastMonthAcc.claimPayments = 0;
        agent.assets.p.lastMonthAcc.totalWorkersTicks = 100;

        for (let month = 0; month < 200; month++) {
            automaticWageAdjustment(agentMap(agent), planet);
        }

        expect(agent.assets.p.wagePerEdu.tertiary).toBeGreaterThan(5);
        expect(agent.assets.p.wagePerEdu.tertiary).toBeLessThanOrEqual(10 * 1.001);
    });

    it('raises the wage when the quit rate exceeds the target', () => {
        const { planet } = makePlanetWithPopulation({});
        const agent = makeAgent();
        agent.assets.p.wagePerEdu = { none: 100, primary: 100, secondary: 100, tertiary: 100 };
        agent.assets.p.workforceDemography[30].tertiary.active = 1000;
        agent.assets.p._monthlyVoluntaryQuits = { none: 0, primary: 0, secondary: 0, tertiary: 100 };

        automaticWageAdjustment(agentMap(agent), planet);

        expect(agent.assets.p.wagePerEdu.tertiary).toBeGreaterThan(100);
    });

    it('lowers the wage when the quit rate is below the target', () => {
        const { planet } = makePlanetWithPopulation({});
        const agent = makeAgent();
        agent.assets.p.wagePerEdu = { none: 100, primary: 100, secondary: 100, tertiary: 100 };
        agent.assets.p.workforceDemography[30].none.active = 1000;

        automaticWageAdjustment(agentMap(agent), planet);

        expect(agent.assets.p.wagePerEdu.none).toBeLessThan(100);
    });

    it('caps lower education wages by the next higher tier', () => {
        const { planet } = makePlanetWithPopulation({});
        const agent = makeAgent();
        agent.assets.p.wagePerEdu = { none: 300, primary: 200, secondary: 100, tertiary: 50 };

        automaticWageAdjustment(agentMap(agent), planet);

        const wage = agent.assets.p.wagePerEdu;
        expect(wage.primary).toBeGreaterThanOrEqual(wage.none);
        expect(wage.secondary).toBeGreaterThanOrEqual(wage.primary);
        expect(wage.tertiary).toBeGreaterThanOrEqual(wage.secondary);
    });

    it('never lowers the wage below MIN_WAGE', () => {
        const { planet } = makePlanetWithPopulation({});
        const agent = makeAgent();
        agent.assets.p.wagePerEdu = { none: MIN_WAGE, primary: MIN_WAGE, secondary: MIN_WAGE, tertiary: MIN_WAGE };
        agent.assets.p.workforceDemography[30].none.active = 100;

        automaticWageAdjustment(agentMap(agent), planet);

        expect(agent.assets.p.wagePerEdu.none).toBe(MIN_WAGE);
    });

    it('never raises the wage above MAX_WAGE', () => {
        const { planet } = makePlanetWithPopulation({});
        const agent = makeAgent();
        agent.assets.p.wagePerEdu = { none: MAX_WAGE, primary: MAX_WAGE, secondary: MAX_WAGE, tertiary: MAX_WAGE };
        agent.assets.p.totalSlotCapacity.none = 100;

        automaticWageAdjustment(agentMap(agent), planet);

        expect(agent.assets.p.wagePerEdu.none).toBeLessThanOrEqual(MAX_WAGE);
    });
});
