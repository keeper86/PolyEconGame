import { beforeEach, describe, expect, it } from 'vitest';

import { FIRE_RATE_LIMIT_PER_MONTH, HIRE_RATE_LIMIT_PER_MONTH, NOTICE_PERIOD_MONTHS } from '../constants';
import type { EducationLevelType } from '../population/education';
import { agentMap, makeAgent, makePlanetWithPopulation, sumPopOcc } from '../utils/testHelper';
import { hireWorkforce, perTickLimit, setFireRateLimitPerMonth, setHireRateLimitPerMonth } from './hireWorkforce';
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
        setHireRateLimitPerMonth(Number.POSITIVE_INFINITY);
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

    it('fills at most one tick worth of the hire gap even with unlimited willing workers', () => {
        const { planet } = makePlanetWithPopulation({ primary: 100_000 });
        const agent = makeAgent();
        const assets = agent.assets.p;
        assets.totalSlotCapacity.primary = 100_000;
        assets.allocatedWorkers.primary = 100_000;
        assets.wagePerEdu.primary = 1e9;
        setHireRateLimitPerMonth(HIRE_RATE_LIMIT_PER_MONTH);

        hireWorkforce(agentMap(agent), planet);

        const workforce = agent.assets.p.workforceDemography!;
        const onboarded = totalOnboardingForEdu(workforce, 'primary');
        expect(onboarded).toBeGreaterThan(0);
        expect(onboarded).toBeLessThanOrEqual(perTickLimit(100_000, HIRE_RATE_LIMIT_PER_MONTH));
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
