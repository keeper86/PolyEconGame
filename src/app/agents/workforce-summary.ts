/**
 * Computes an aggregate summary of an agent's workforce demography.
 * Pure logic — no React, no UI.
 *
 * The workforce is stored as `CohortByOccupation<WorkforceCategory>[]`
 * (age-indexed).  Each slot is `{ [edu]: { [skill]: WorkforceCategory } }`
 * where `WorkforceCategory = { active: number, departing: number[],
 * departingFired: number[] }`.
 */

import type { EducationLevelType } from '@/simulation/population/education';
import { educationLevelKeys } from '@/simulation/population/education';
import type { CohortByOccupation, WorkforceCategory } from '@/simulation/population/population';
import { MAX_AGE, SKILL } from '@/simulation/population/population';
import { ageProductivityMultiplier } from '@/simulation/workforce/laborMarketTick';

/** Alias for the workforce demography structure used by agents. */
export type WorkforceDemography = CohortByOccupation<WorkforceCategory>[];

// ---------------------------------------------------------------------------
// Summary type
// ---------------------------------------------------------------------------

export type WorkforceSummary = {
    activeByEdu: Record<EducationLevelType, number>;
    departingByEdu: Record<EducationLevelType, number>;
    /** Fired workers currently in the departing pipeline, per education level. */
    firedByEdu: Record<EducationLevelType, number>;
    /** Voluntary quitters in the departing pipeline (departing − fired), per education level. */
    voluntaryByEdu: Record<EducationLevelType, number>;
    /** Workers leaving next month (pipeline slot 0) per edu — voluntary quits. */
    nextMonthVoluntaryByEdu: Record<EducationLevelType, number>;
    /** Workers leaving next month (pipeline slot 0) per edu — fired. */
    nextMonthFiredByEdu: Record<EducationLevelType, number>;
    totalActive: number;
    totalDeparting: number;
    totalFired: number;
    totalVoluntary: number;
    avgExperienceMultiplier: number;

    /** Per-education mean age (weighted by headcount). */
    meanAgeByEdu: Record<EducationLevelType, number>;
    /** Per-education age productivity multiplier. */
    ageProductivityByEdu: Record<EducationLevelType, number>;
    /** Overall weighted mean age. */
    overallMeanAge: number;
    /** Overall age-based productivity multiplier. */
    overallAgeProductivity: number;

    /** Weighted mean tenure (years) per education level. */
    meanTenureByEdu: Record<EducationLevelType, number>;
    /** Experience (tenure) productivity multiplier per education level. */
    tenureProductivityByEdu: Record<EducationLevelType, number>;
    /** Overall weighted mean tenure across all education levels. */
    overallMeanTenure: number;
    /** Overall tenure-based productivity multiplier. */
    overallTenureProductivity: number;

    // ---- Age distribution (direct from array index) ----

    /** Per-age chart data with status breakdown (active / quitting / fired). */
    ageChartByStatus: {
        age: number;
        active: number;
        quitting: number;
        fired: number;
    }[];

    /** Per-age chart data with education-level breakdown (active + departing per edu). */
    ageChartByEdu: {
        age: number;
        byEdu: Record<EducationLevelType, number>;
    }[];
};

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

export function computeSummary(workforce: WorkforceDemography): WorkforceSummary {
    const activeByEdu = {} as Record<EducationLevelType, number>;
    const departingByEdu = {} as Record<EducationLevelType, number>;
    const firedByEdu = {} as Record<EducationLevelType, number>;
    const nextMonthDepartingByEdu = {} as Record<EducationLevelType, number>;
    const nextMonthFiredByEdu = {} as Record<EducationLevelType, number>;
    for (const edu of educationLevelKeys) {
        activeByEdu[edu] = 0;
        departingByEdu[edu] = 0;
        firedByEdu[edu] = 0;
        nextMonthDepartingByEdu[edu] = 0;
        nextMonthFiredByEdu[edu] = 0;
    }

    let totalActive = 0;
    let totalDeparting = 0;

    // ---- Accumulators for mean age ----
    const ageSumByEdu = {} as Record<EducationLevelType, { count: number; weightedAge: number }>;
    for (const edu of educationLevelKeys) {
        ageSumByEdu[edu] = { count: 0, weightedAge: 0 };
    }

    // ---- Per-age accumulators for chart data ----
    const ageChartByStatus: WorkforceSummary['ageChartByStatus'] = [];
    const ageChartByEdu: WorkforceSummary['ageChartByEdu'] = [];

    // ---- Walk age cohorts ----
    for (let age = 0; age <= Math.min(MAX_AGE, workforce.length - 1); age++) {
        const cohort = workforce[age];
        if (!cohort) {
            continue;
        }

        let ageActive = 0;
        let ageDeparting = 0;
        let ageFired = 0;
        const ageByEdu = {} as Record<EducationLevelType, number>;
        for (const edu of educationLevelKeys) {
            ageByEdu[edu] = 0;
        }

        for (const edu of educationLevelKeys) {
            // Sum across all skill levels for this edu
            for (const skill of SKILL) {
                const cat = cohort[edu][skill];
                const act = cat.active;

                activeByEdu[edu] += act;
                totalActive += act;
                ageActive += act;
                ageByEdu[edu] += act;

                if (act > 0) {
                    ageSumByEdu[edu].weightedAge += act * age;
                    ageSumByEdu[edu].count += act;
                }

                // Departing pipeline
                for (let m = 0; m < cat.departing.length; m++) {
                    const depCount = cat.departing[m] ?? 0;
                    const firedCount = cat.departingFired[m] ?? 0;
                    departingByEdu[edu] += depCount;
                    totalDeparting += depCount;
                    firedByEdu[edu] += firedCount;
                    ageDeparting += depCount;
                    ageFired += firedCount;
                    ageByEdu[edu] += depCount;

                    if (m === 0) {
                        nextMonthDepartingByEdu[edu] += depCount;
                        nextMonthFiredByEdu[edu] += firedCount;
                    }
                }
            }
        }

        // Only include ages that have at least one worker
        if (ageActive + ageDeparting > 0) {
            const quitting = Math.max(0, ageDeparting - ageFired);
            ageChartByStatus.push({ age, active: ageActive, quitting, fired: ageFired });
            ageChartByEdu.push({ age, byEdu: { ...ageByEdu } });
        }
    }

    // ---- Per-education age stats ----
    const meanAgeByEdu = {} as Record<EducationLevelType, number>;
    const ageProductivityByEdu = {} as Record<EducationLevelType, number>;
    let overallWeightedAge = 0;
    let overallCount = 0;

    for (const edu of educationLevelKeys) {
        const s = ageSumByEdu[edu];
        if (s.count > 0) {
            meanAgeByEdu[edu] = s.weightedAge / s.count;
            ageProductivityByEdu[edu] = ageProductivityMultiplier(meanAgeByEdu[edu]);
            overallWeightedAge += s.weightedAge;
            overallCount += s.count;
        } else {
            meanAgeByEdu[edu] = 30;
            ageProductivityByEdu[edu] = ageProductivityMultiplier(30);
        }
    }

    const overallMeanAge = overallCount > 0 ? overallWeightedAge / overallCount : 30;
    const overallAgeProductivity = ageProductivityMultiplier(overallMeanAge);

    // ---- Fired & voluntary totals ----
    const totalFired = educationLevelKeys.reduce((sum, edu) => sum + firedByEdu[edu], 0);
    const voluntaryByEdu = {} as Record<EducationLevelType, number>;
    const nextMonthVoluntaryByEdu = {} as Record<EducationLevelType, number>;
    for (const edu of educationLevelKeys) {
        voluntaryByEdu[edu] = Math.max(0, departingByEdu[edu] - firedByEdu[edu]);
        nextMonthVoluntaryByEdu[edu] = Math.max(0, nextMonthDepartingByEdu[edu] - nextMonthFiredByEdu[edu]);
    }
    const totalVoluntary = educationLevelKeys.reduce((sum, edu) => sum + voluntaryByEdu[edu], 0);

    // ---- Age-based productivity serves as the overall productivity metric ----
    // Tenure-based productivity is no longer tracked per-worker; we use age productivity instead.
    const meanTenureByEdu = {} as Record<EducationLevelType, number>;
    const tenureProductivityByEdu = {} as Record<EducationLevelType, number>;
    for (const edu of educationLevelKeys) {
        meanTenureByEdu[edu] = 0;
        tenureProductivityByEdu[edu] = 1.0;
    }

    return {
        activeByEdu,
        departingByEdu,
        firedByEdu,
        voluntaryByEdu,
        nextMonthVoluntaryByEdu,
        nextMonthFiredByEdu,
        totalActive,
        totalDeparting,
        totalFired,
        totalVoluntary,
        avgExperienceMultiplier: overallAgeProductivity,
        meanAgeByEdu,
        ageProductivityByEdu,
        overallMeanAge,
        overallAgeProductivity,
        meanTenureByEdu,
        tenureProductivityByEdu,
        overallMeanTenure: 0,
        overallTenureProductivity: 1.0,
        ageChartByStatus,
        ageChartByEdu,
    };
}
