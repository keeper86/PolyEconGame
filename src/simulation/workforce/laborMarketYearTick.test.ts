import { describe, it, expect, beforeEach } from 'vitest';

import type { Agent } from '../planet';
import { educationLevelKeys } from '../planet';

import { laborMarketYearTick } from './laborMarketYearTick';
import { makeAgent } from './testHelpers';
import {
    MAX_TENURE_YEARS,
    totalActiveForEdu,
    totalDepartingForEdu,
    ageMomentsForAge,
    ageMean,
    ageVariance,
} from './workforceHelpers';

// ---------------------------------------------------------------------------
// laborMarketYearTick — basic behaviour
// ---------------------------------------------------------------------------

describe('laborMarketYearTick', () => {
    let agent: Agent;

    beforeEach(() => {
        agent = makeAgent();
    });

    it('moves workers from year 0 to year 1', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[0].active.primary = ageMomentsForAge(25, 100);

        laborMarketYearTick(new Map([[agent.id, agent]]));

        expect(workforce[0].active.primary.count).toBe(0);
        expect(workforce[1].active.primary.count).toBe(100);
    });

    it('workers in the last tenure year stay there (do not overflow)', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[MAX_TENURE_YEARS].active.secondary = ageMomentsForAge(50, 50);

        laborMarketYearTick(new Map([[agent.id, agent]]));

        expect(workforce[MAX_TENURE_YEARS].active.secondary.count).toBe(50);
    });

    it('shifts departing pipeline entries along with active workers', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[0].departing.tertiary[1] = ageMomentsForAge(30, 8);

        laborMarketYearTick(new Map([[agent.id, agent]]));

        expect(workforce[0].departing.tertiary[1].count).toBe(0);
        expect(workforce[1].departing.tertiary[1].count).toBe(8);
    });
});

// ---------------------------------------------------------------------------
// Age moments — year tick
// ---------------------------------------------------------------------------

describe('age moments — year tick', () => {
    it('advances mean age by 1 when shifting tenure years', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[0].active.primary = ageMomentsForAge(25, 100);

        laborMarketYearTick(new Map([[agent.id, agent]]));

        expect(wf[1].active.primary.count).toBe(100);
        expect(ageMean(wf[1].active.primary)).toBeCloseTo(26, 5);
        expect(ageVariance(wf[1].active.primary)).toBeCloseTo(0, 5);
    });

    it('merges two cohorts and advances combined mean by 1 when both land in the same bucket', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[MAX_TENURE_YEARS].active.secondary = ageMomentsForAge(50, 100);
        wf[MAX_TENURE_YEARS - 1].active.secondary = ageMomentsForAge(48, 100);

        laborMarketYearTick(new Map([[agent.id, agent]]));

        expect(wf[MAX_TENURE_YEARS].active.secondary.count).toBe(200);
        // Both advance by 1: 51 and 49, merge mean = 50
        expect(ageMean(wf[MAX_TENURE_YEARS].active.secondary)).toBeCloseTo(50, 0);
    });

    it('workers in distinct tenure years each advance independently', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[0].active.secondary = ageMomentsForAge(25, 100);
        wf[1].active.secondary = ageMomentsForAge(26, 100);

        laborMarketYearTick(new Map([[agent.id, agent]]));

        expect(wf[1].active.secondary.count).toBe(100);
        expect(ageMean(wf[1].active.secondary)).toBeCloseTo(26, 5);
        expect(wf[2].active.secondary.count).toBe(100);
        expect(ageMean(wf[2].active.secondary)).toBeCloseTo(27, 5);
    });

    it('resets year-0 after shifting', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[0].active.none = ageMomentsForAge(22, 50);

        laborMarketYearTick(new Map([[agent.id, agent]]));

        expect(wf[0].active.none.count).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Conservation — year tick
// ---------------------------------------------------------------------------

describe('laborMarketYearTick — conservation', () => {
    it('conserves total active workers across tenure shift', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;

        wf[0].active.none = ageMomentsForAge(25, 100);
        wf[5].active.none = ageMomentsForAge(30, 200);
        wf[MAX_TENURE_YEARS].active.none = ageMomentsForAge(60, 50);
        wf[0].active.primary = ageMomentsForAge(25, 80);

        const totalBefore = totalActiveForEdu(wf, 'none') + totalActiveForEdu(wf, 'primary');

        laborMarketYearTick(new Map([[agent.id, agent]]));

        const totalAfter = totalActiveForEdu(wf, 'none') + totalActiveForEdu(wf, 'primary');
        expect(totalAfter).toBe(totalBefore);
    });

    it('conserves departing pipeline counts across tenure shift', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;

        wf[0].departing.none[3] = ageMomentsForAge(30, 10);
        wf[0].departing.none[7] = ageMomentsForAge(30, 5);
        wf[2].departing.primary[0] = ageMomentsForAge(30, 20);

        const depNoneBefore = totalDepartingForEdu(wf, 'none');
        const depPrimBefore = totalDepartingForEdu(wf, 'primary');

        laborMarketYearTick(new Map([[agent.id, agent]]));

        expect(totalDepartingForEdu(wf, 'none')).toBe(depNoneBefore);
        expect(totalDepartingForEdu(wf, 'primary')).toBe(depPrimBefore);
    });

    it("workers at MAX_TENURE_YEARS accumulate (don't overflow)", () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;

        wf[MAX_TENURE_YEARS].active.none = ageMomentsForAge(60, 30);
        wf[MAX_TENURE_YEARS - 1].active.none = ageMomentsForAge(58, 20);

        laborMarketYearTick(new Map([[agent.id, agent]]));

        expect(wf[MAX_TENURE_YEARS].active.none.count).toBe(50);
        expect(wf[MAX_TENURE_YEARS - 1].active.none.count).toBe(0);
    });

    it('year-0 bucket is fully cleared after shift', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;

        wf[0].active.none = ageMomentsForAge(25, 100);
        wf[0].departing.primary[5] = ageMomentsForAge(30, 10);

        laborMarketYearTick(new Map([[agent.id, agent]]));

        expect(wf[0].active.none.count).toBe(0);
        expect(wf[0].departing.primary[5].count).toBe(0);
    });

    it('workforce at MAX_TENURE_YEARS survives year tick without data loss', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;

        for (const edu of educationLevelKeys) {
            wf[MAX_TENURE_YEARS].active[edu] = ageMomentsForAge(60, 100);
            wf[MAX_TENURE_YEARS].departing[edu][3] = ageMomentsForAge(60, 10);
        }

        laborMarketYearTick(new Map([[agent.id, agent]]));

        for (const edu of educationLevelKeys) {
            expect(wf[MAX_TENURE_YEARS].active[edu].count).toBe(100);
            expect(wf[MAX_TENURE_YEARS].departing[edu][3].count).toBe(10);
        }
    });
});
