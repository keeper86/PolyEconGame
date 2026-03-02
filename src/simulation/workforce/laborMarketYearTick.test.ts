import { describe, it, expect, beforeEach } from 'vitest';

import type { Agent } from '../planet';
import { educationLevelKeys } from '../planet';

import { laborMarketYearTick } from './laborMarketYearTick';
import { makeAgent } from './testHelpers';
import {
    MAX_TENURE_YEARS,
    DEFAULT_HIRE_AGE_MEAN,
    totalActiveForEdu,
    totalDepartingForEdu,
    totalRetiringForEdu,
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
        workforce[0].active.primary = 100;

        laborMarketYearTick([agent]);

        expect(workforce[0].active.primary).toBe(0);
        expect(workforce[1].active.primary).toBe(100);
    });

    it('workers in the last tenure year stay there (do not overflow)', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[MAX_TENURE_YEARS].active.secondary = 50;

        laborMarketYearTick([agent]);

        expect(workforce[MAX_TENURE_YEARS].active.secondary).toBe(50);
    });

    it('shifts departing pipeline entries along with active workers', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[0].departing.tertiary[1] = 8;

        laborMarketYearTick([agent]);

        expect(workforce[0].departing.tertiary[1]).toBe(0);
        expect(workforce[1].departing.tertiary[1]).toBe(8);
    });

    it('shifts retiring pipeline entries along with active workers', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[0].retiring.none[1] = 5;

        laborMarketYearTick([agent]);

        expect(workforce[0].retiring.none[1]).toBe(0);
        expect(workforce[1].retiring.none[1]).toBe(5);
    });
});

// ---------------------------------------------------------------------------
// Age moments — year tick
// ---------------------------------------------------------------------------

describe('age moments — year tick', () => {
    it('advances ageMoments.mean by 1 when shifting tenure years', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[0].active.primary = 100;
        wf[0].ageMoments.primary = { mean: 25, variance: 4 };

        laborMarketYearTick([agent]);

        expect(wf[1].active.primary).toBe(100);
        expect(wf[1].ageMoments.primary.mean).toBe(26);
        expect(wf[1].ageMoments.primary.variance).toBeCloseTo(4, 5);
    });

    it('merges two cohorts and advances combined mean by 1 when both land in the same bucket', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[MAX_TENURE_YEARS].active.secondary = 100;
        wf[MAX_TENURE_YEARS].ageMoments.secondary = { mean: 50, variance: 0 };
        wf[MAX_TENURE_YEARS - 1].active.secondary = 100;
        wf[MAX_TENURE_YEARS - 1].ageMoments.secondary = { mean: 48, variance: 0 };

        laborMarketYearTick([agent]);

        expect(wf[MAX_TENURE_YEARS].active.secondary).toBe(200);
        expect(wf[MAX_TENURE_YEARS].ageMoments.secondary.mean).toBeCloseTo(50, 5);
    });

    it('workers in distinct tenure years each advance independently', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[0].active.secondary = 100;
        wf[0].ageMoments.secondary = { mean: 25, variance: 0 };
        wf[1].active.secondary = 100;
        wf[1].ageMoments.secondary = { mean: 26, variance: 0 };

        laborMarketYearTick([agent]);

        expect(wf[1].active.secondary).toBe(100);
        expect(wf[1].ageMoments.secondary.mean).toBeCloseTo(26, 5);
        expect(wf[2].active.secondary).toBe(100);
        expect(wf[2].ageMoments.secondary.mean).toBeCloseTo(27, 5);
    });

    it('resets year-0 ageMoments to default after shifting', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[0].active.none = 50;
        wf[0].ageMoments.none = { mean: 22, variance: 2 };

        laborMarketYearTick([agent]);

        expect(wf[0].active.none).toBe(0);
        expect(wf[0].ageMoments.none.mean).toBe(DEFAULT_HIRE_AGE_MEAN);
        expect(wf[0].ageMoments.none.variance).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Conservation — year tick
// ---------------------------------------------------------------------------

describe('laborMarketYearTick — conservation', () => {
    it('conserves total active workers across tenure shift', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;

        wf[0].active.none = 100;
        wf[5].active.none = 200;
        wf[MAX_TENURE_YEARS].active.none = 50;
        wf[0].active.primary = 80;

        const totalBefore = totalActiveForEdu(wf, 'none') + totalActiveForEdu(wf, 'primary');

        laborMarketYearTick([agent]);

        const totalAfter = totalActiveForEdu(wf, 'none') + totalActiveForEdu(wf, 'primary');
        expect(totalAfter).toBe(totalBefore);
    });

    it('conserves departing pipeline counts across tenure shift', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;

        wf[0].departing.none[3] = 10;
        wf[0].departing.none[7] = 5;
        wf[2].departing.primary[0] = 20;

        const depNoneBefore = totalDepartingForEdu(wf, 'none');
        const depPrimBefore = totalDepartingForEdu(wf, 'primary');

        laborMarketYearTick([agent]);

        expect(totalDepartingForEdu(wf, 'none')).toBe(depNoneBefore);
        expect(totalDepartingForEdu(wf, 'primary')).toBe(depPrimBefore);
    });

    it('conserves retiring pipeline counts across tenure shift', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;

        wf[1].retiring.secondary[5] = 15;
        wf[MAX_TENURE_YEARS - 1].retiring.secondary[11] = 3;

        const retBefore = totalRetiringForEdu(wf, 'secondary');

        laborMarketYearTick([agent]);

        expect(totalRetiringForEdu(wf, 'secondary')).toBe(retBefore);
    });

    it("workers at MAX_TENURE_YEARS accumulate (don't overflow)", () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;

        wf[MAX_TENURE_YEARS].active.none = 30;
        wf[MAX_TENURE_YEARS - 1].active.none = 20;

        laborMarketYearTick([agent]);

        expect(wf[MAX_TENURE_YEARS].active.none).toBe(50);
        expect(wf[MAX_TENURE_YEARS - 1].active.none).toBe(0);
    });

    it('year-0 bucket is fully cleared after shift', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;

        wf[0].active.none = 100;
        wf[0].departing.primary[5] = 10;
        wf[0].retiring.secondary[3] = 7;

        laborMarketYearTick([agent]);

        expect(wf[0].active.none).toBe(0);
        expect(wf[0].departing.primary[5]).toBe(0);
        expect(wf[0].retiring.secondary[3]).toBe(0);
    });

    it('workforce at MAX_TENURE_YEARS survives year tick without data loss', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;

        for (const edu of educationLevelKeys) {
            wf[MAX_TENURE_YEARS].active[edu] = 100;
            wf[MAX_TENURE_YEARS].departing[edu][3] = 10;
            wf[MAX_TENURE_YEARS].retiring[edu][5] = 5;
        }

        laborMarketYearTick([agent]);

        for (const edu of educationLevelKeys) {
            expect(wf[MAX_TENURE_YEARS].active[edu]).toBe(100);
            expect(wf[MAX_TENURE_YEARS].departing[edu][3]).toBe(10);
            expect(wf[MAX_TENURE_YEARS].retiring[edu][5]).toBe(5);
        }
    });
});
