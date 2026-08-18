import { describe, it, expect } from 'vitest';
import { computeSummary } from './workforceSummary';
import { nullWorkforceCategory } from '@/simulation/workforce/workforce';
import { nullWorkforceCohortFactory } from '@/simulation/workforce/workforce';
import type { WorkforceCategory, WorkforceDemography } from '@/simulation/workforce/workforce';
import type { EducationLevelType } from '@/simulation/population/education';
import { MAX_AGE } from '@/simulation/population/population';

function makeEmptyDemography(): WorkforceDemography {
    const arr: WorkforceDemography = [];
    for (let age = 0; age <= MAX_AGE; age++) {
        arr.push(nullWorkforceCohortFactory(nullWorkforceCategory));
    }
    return arr;
}

function setCategory(
    demography: WorkforceDemography,
    age: number,
    edu: EducationLevelType,
    overrides: Partial<WorkforceCategory>,
): void {
    Object.assign(demography[age][edu], overrides);
}

describe('computeSummary', () => {
    describe('meanTenureByEdu', () => {
        it('average XP when only active workers present', () => {
            const wf = makeEmptyDemography();
            setCategory(wf, 30, 'secondary', {
                active: 10,
                workforceExperience: 50,
            });

            const summary = computeSummary(wf);
            expect(summary.meanTenureByEdu.secondary).toBeCloseTo(5.0);
        });

        it('average XP with active + onboarding + departing workers', () => {
            const wf = makeEmptyDemography();
            setCategory(wf, 30, 'secondary', {
                active: 5,
                onboarding: [1, 1, 0],
                voluntaryDeparting: [2, 0, 0],
                workforceExperience: 80,
            });

            const summary = computeSummary(wf);
            // total workers = 5 + 2 + 2 = 9, total XP = 80
            // mean tenure = 80 / 9 ≈ 8.889
            expect(summary.meanTenureByEdu.secondary).toBeCloseTo(80 / 9);
        });

        it('average XP across multiple ages', () => {
            const wf = makeEmptyDemography();
            setCategory(wf, 30, 'secondary', {
                active: 5,
                workforceExperience: 40,
            });
            setCategory(wf, 40, 'secondary', {
                active: 3,
                workforceExperience: 45,
            });
            setCategory(wf, 50, 'secondary', {
                active: 2,
                workforceExperience: 30,
            });

            const summary = computeSummary(wf);
            // total XP = 40 + 45 + 30 = 115, total workers = 5 + 3 + 2 = 10
            expect(summary.meanTenureByEdu.secondary).toBeCloseTo(115 / 10);
        });

        it('returns 0 when no workers', () => {
            const wf = makeEmptyDemography();
            const summary = computeSummary(wf);
            expect(summary.meanTenureByEdu.secondary).toBe(0);
        });

        it('handles onboarding contributing to total worker count', () => {
            const wf = makeEmptyDemography();
            setCategory(wf, 25, 'tertiary', {
                active: 1,
                onboarding: [0, 1, 0],
                workforceExperience: 5,
            });

            const summary = computeSummary(wf);
            // total workers = 1 + 1 = 2, XP = 5, mean = 2.5
            expect(summary.meanTenureByEdu.tertiary).toBeCloseTo(2.5);
        });

        it('counts zero-XP workers in total for mean tenure', () => {
            const wf = makeEmptyDemography();
            setCategory(wf, 25, 'secondary', {
                active: 5,
                workforceExperience: 0,
            });
            setCategory(wf, 30, 'secondary', {
                active: 5,
                workforceExperience: 50,
            });

            const summary = computeSummary(wf);
            // total workers = 5 + 5 = 10, total XP = 0 + 50 = 50, mean tenure = 50/10 = 5
            expect(summary.meanTenureByEdu.secondary).toBeCloseTo(5.0);
        });
    });

    describe('overallMeanTenure', () => {
        it('divides weighted XP by total workers across all education levels', () => {
            const wf = makeEmptyDemography();
            setCategory(wf, 30, 'none', {
                active: 8,
                workforceExperience: 32,
            });
            setCategory(wf, 30, 'primary', {
                active: 2,
                onboarding: [1, 0, 0],
                workforceExperience: 15,
            });

            const summary = computeSummary(wf);
            // none: XP=32, workers=8
            // primary: XP=15, workers=2+1=3
            // overall: totalXP=47, totalWorkers=11, mean≈4.273
            expect(summary.overallMeanTenure).toBeCloseTo(47 / 11);
        });

        it('returns 0 when no workers exist', () => {
            const wf = makeEmptyDemography();
            const summary = computeSummary(wf);
            expect(summary.overallMeanTenure).toBe(0);
        });
    });

    describe('meanAgeByEdu (not affected by fix)', () => {
        it('still computes mean age from active workers only', () => {
            const wf = makeEmptyDemography();
            setCategory(wf, 30, 'secondary', {
                active: 5,
                workforceExperience: 50,
            });
            setCategory(wf, 40, 'secondary', {
                active: 5,
                workforceExperience: 50,
            });

            const summary = computeSummary(wf);
            // mean age = (30*5 + 40*5) / 10 = 35
            expect(summary.meanAgeByEdu.secondary).toBeCloseTo(35);
        });
    });
});
