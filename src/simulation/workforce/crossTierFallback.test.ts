import { beforeEach, describe, expect, it } from 'vitest';

import { FIRE_RATE_LIMIT_PER_MONTH, NOTICE_PERIOD_MONTHS, TICKS_PER_MONTH } from '../constants';
import type { EducationLevelType } from '../population/education';
import { agentMap, makeAgent, makeHRFacility, makePlanetWithPopulation, sumPopOcc } from '../utils/testHelper';
import { hireWorkforce, setFireRateLimitPerMonth, setHireFlowMultiplier } from './hireWorkforce';
import { automaticWorkerAllocation } from './automaticWorkerAllocation';

const makeOnlySecondaryPlanet = (): ReturnType<typeof makePlanetWithPopulation> =>
    makePlanetWithPopulation({ secondary: 100_000 });

const totalActiveForEdu = (
    workforce: NonNullable<ReturnType<typeof makeAgent>['assets']['p']['workforceDemography']>,
    edu: EducationLevelType,
): number => {
    let total = 0;
    for (const cohort of workforce) {
        total += cohort[edu].active;
    }
    return total;
};

const totalOnboardingForEdu = (
    workforce: NonNullable<ReturnType<typeof makeAgent>['assets']['p']['workforceDemography']>,
    edu: EducationLevelType,
): number => {
    let total = 0;
    for (const cohort of workforce) {
        total += cohort[edu].onboarding[NOTICE_PERIOD_MONTHS - 1];
    }
    return total;
};

describe('cross-tier fallback bookkeeping', () => {
    beforeEach(() => {
        setHireFlowMultiplier(Number.POSITIVE_INFINITY);
        setFireRateLimitPerMonth(FIRE_RATE_LIMIT_PER_MONTH);
    });

    const makeCompanyWithLowTierJobsAndOnlyHighTierWorkers = (
        jobs: number,
    ): { agent: ReturnType<typeof makeAgent>; planet: ReturnType<typeof makePlanetWithPopulation>['planet'] } => {
        const { planet } = makeOnlySecondaryPlanet();
        const agent = makeAgent();
        const assets = agent.assets.p;
        assets.totalSlotCapacity.none = jobs;
        for (const edu of ['none', 'primary', 'secondary', 'tertiary'] as EducationLevelType[]) {
            assets.allocatedWorkers[edu] = edu === 'none' ? jobs : 0;
            assets.wagePerEdu[edu] = 1e9;
        }
        return { agent, planet };
    };

    it('does not order a fresh worker every tick for the same low-tier job', () => {
        const { agent, planet } = makeCompanyWithLowTierJobsAndOnlyHighTierWorkers(1000);
        const workforce = agent.assets.p.workforceDemography!;

        for (let tick = 0; tick < 12; tick++) {
            automaticWorkerAllocation(agentMap(agent), planet);
            hireWorkforce(agentMap(agent), planet);
        }

        const hired = sumPopOcc(planet, 'secondary', 'employed');
        expect(hired).toBeLessThanOrEqual(1050);
        expect(
            totalOnboardingForEdu(workforce, 'secondary') + totalActiveForEdu(workforce, 'secondary'),
        ).toBeLessThanOrEqual(1050);
    });

    it('fills low-tier slots from a higher tier over repeated ticks when no fitting employable exists', () => {
        const { planet } = makePlanetWithPopulation({ secondary: 100_000 });
        const agent = makeAgent();
        const assets = agent.assets.p;
        assets.totalSlotCapacity.none = 1000;
        for (const edu of ['none', 'primary', 'secondary', 'tertiary'] as EducationLevelType[]) {
            assets.allocatedWorkers[edu] = edu === 'none' ? 1000 : 0;
            assets.wagePerEdu[edu] = 1e9;
        }
        assets.humanResourcesDepartment = makeHRFacility(undefined, { scale: 0.513, hrBuffer: 5000 });
        setHireFlowMultiplier(1);
        setFireRateLimitPerMonth(FIRE_RATE_LIMIT_PER_MONTH);

        for (let tick = 0; tick < TICKS_PER_MONTH; tick++) {
            automaticWorkerAllocation(agentMap(agent), planet);
            hireWorkforce(agentMap(agent), planet);
        }
        const afterOneMonth = sumPopOcc(planet, 'secondary', 'employed');
        expect(afterOneMonth).toBeGreaterThan(0);

        for (let tick = 0; tick < TICKS_PER_MONTH * 4; tick++) {
            automaticWorkerAllocation(agentMap(agent), planet);
            hireWorkforce(agentMap(agent), planet);
        }
        const afterRampUp = sumPopOcc(planet, 'secondary', 'employed');
        expect(afterRampUp).toBeGreaterThanOrEqual(1000);
        expect(afterRampUp).toBeLessThanOrEqual(1050);
    });

    it('stops hiring when the HR service buffer runs out', () => {
        const { planet } = makePlanetWithPopulation({ none: 100_000 });
        const agent = makeAgent();
        const assets = agent.assets.p;
        assets.totalSlotCapacity.none = 1000;
        assets.allocatedWorkers.none = 1000;
        assets.wagePerEdu.none = 1e9;
        assets.humanResourcesDepartment = makeHRFacility(undefined, { scale: 10, hrBuffer: 25 });
        setHireFlowMultiplier(Number.POSITIVE_INFINITY);

        hireWorkforce(agentMap(agent), planet);

        expect(sumPopOcc(planet, 'none', 'employed')).toBe(25);
        expect(agent.assets.p.humanResourcesDepartment?.hrBuffer).toBe(0);
    });

    it('does not fire a higher-tier worker who is filling a lower-tier slot', () => {
        const { agent, planet } = makeCompanyWithLowTierJobsAndOnlyHighTierWorkers(1000);
        const workforce = agent.assets.p.workforceDemography!;

        hireWorkforce(agentMap(agent), planet);
        for (const cohort of workforce) {
            const hired = cohort.secondary.onboarding[NOTICE_PERIOD_MONTHS - 1];
            cohort.secondary.active += hired;
            cohort.secondary.onboarding[NOTICE_PERIOD_MONTHS - 1] = 0;
        }
        const activeBefore = totalActiveForEdu(workforce, 'secondary');
        expect(activeBefore).toBe(1000);

        automaticWorkerAllocation(agentMap(agent), planet);
        hireWorkforce(agentMap(agent), planet);

        expect(totalActiveForEdu(workforce, 'secondary')).toBe(1000);
    });
});
