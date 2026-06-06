/**
 * Computes an aggregate summary of an agent's workforce demography.
 * Pure logic — no React, no UI.
 *
 * The workforce is stored as `CohortByOccupation<WorkforceCategory>[]`
 * (age-indexed).  Each slot is `{ [edu]: { [skill]: WorkforceCategory } }`
 * where `WorkforceCategory = { active: number, departing: number[],
 * departingFired: number[], departingRetired: number[] }`.
 */

import type { EducationLevelType } from '@/simulation/population/education';
import { educationLevelKeys } from '@/simulation/population/education';
import type { WorkforceCohort, WorkforceCategory } from '@/simulation/workforce/workforce';
import { productivityFromXP } from '@/simulation/workforce/workforce';
import { MAX_AGE, SKILL } from '@/simulation/population/population';
import { ageProductivityMultiplier } from '@/simulation/planet/production';

/** Alias for the workforce demography structure used by agents. */
export type WorkforceDemography = WorkforceCohort<WorkforceCategory>[];

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
    /** Workers in retiring pipeline per education level. */
    retiredByEdu: Record<EducationLevelType, number>;
    /** Workers retiring next month (pipeline slot 0) per edu. */
    nextMonthRetiredByEdu: Record<EducationLevelType, number>;
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

    /** Per-age chart data with status breakdown (active / quitting / fired / retired). */
    ageChartByStatus: {
        age: number;
        active: number;
        quitting: number;
        fired: number;
        retired: number;
    }[];

    /** Per-age chart data with education-level breakdown (active + departing per edu). */
    ageChartByEdu: {
        age: number;
        byEdu: Record<EducationLevelType, number>;
    }[];

    // ---- Experience (XP) distribution — per-capita (years) ----

    /** Per-age XP-per-capita chart data with status breakdown (active / quitting / fired / retired). Values in years. */
    experienceChartByStatus: {
        age: number;
        active: number;
        quitting: number;
        fired: number;
        retired: number;
    }[];

    /** Per-age XP-per-capita chart data with education-level breakdown. Values in years. */
    experienceChartByEdu: {
        age: number;
        byEdu: Record<EducationLevelType, number>;
    }[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sum all values in an array of numbers. */
function sumArray(arr: number[]): number {
    return arr.reduce((s, v) => s + v, 0);
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

export function computeSummary(workforce: WorkforceDemography): WorkforceSummary {
    const activeByEdu = {} as Record<EducationLevelType, number>;
    const departingByEdu = {} as Record<EducationLevelType, number>;
    const firedByEdu = {} as Record<EducationLevelType, number>;
    const nextMonthDepartingByEdu = {} as Record<EducationLevelType, number>;
    const nextMonthFiredByEdu = {} as Record<EducationLevelType, number>;
    const retiredByEdu = {} as Record<EducationLevelType, number>;
    const nextMonthRetiredByEdu = {} as Record<EducationLevelType, number>;
    for (const edu of educationLevelKeys) {
        activeByEdu[edu] = 0;
        departingByEdu[edu] = 0;
        firedByEdu[edu] = 0;
        nextMonthDepartingByEdu[edu] = 0;
        nextMonthFiredByEdu[edu] = 0;
        retiredByEdu[edu] = 0;
        nextMonthRetiredByEdu[edu] = 0;
    }

    let totalActive = 0;
    let totalDeparting = 0;

    // ---- Accumulators for mean age ----
    const ageSumByEdu = {} as Record<EducationLevelType, { count: number; weightedAge: number }>;
    for (const edu of educationLevelKeys) {
        ageSumByEdu[edu] = { count: 0, weightedAge: 0 };
    }

    // ---- Accumulators for mean tenure (XP) ----
    const xpSumByEdu = {} as Record<EducationLevelType, number>;
    for (const edu of educationLevelKeys) {
        xpSumByEdu[edu] = 0;
    }

    // ---- Per-age accumulators for chart data ----
    const ageChartByStatus: WorkforceSummary['ageChartByStatus'] = [];
    const ageChartByEdu: WorkforceSummary['ageChartByEdu'] = [];

    // ---- Per-age accumulators for experience chart data ----
    const experienceChartByStatus: WorkforceSummary['experienceChartByStatus'] = [];
    const experienceChartByEdu: WorkforceSummary['experienceChartByEdu'] = [];

    // ---- Walk age cohorts ----
    for (let age = 0; age <= Math.min(MAX_AGE, workforce.length - 1); age++) {
        const cohort = workforce[age];
        if (!cohort) {
            continue;
        }

        let ageActive = 0;
        let ageDeparting = 0;
        let ageFired = 0;
        let ageRetired = 0;
        const ageByEdu = {} as Record<EducationLevelType, number>;
        for (const edu of educationLevelKeys) {
            ageByEdu[edu] = 0;
        }

        // ---- XP accumulators for this age ----
        let ageXPActive = 0;
        let ageXPDeparting = 0;
        let ageXPFired = 0;
        let ageXPRetired = 0;
        const ageXPByEdu = {} as Record<EducationLevelType, number>;
        for (const edu of educationLevelKeys) {
            ageXPByEdu[edu] = 0;
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

                // Voluntary & fired departing pipeline
                for (let m = 0; m < cat.voluntaryDeparting.length; m++) {
                    const depCount = cat.voluntaryDeparting[m] ?? 0;
                    const firedCount = cat.departingFired[m] ?? 0;
                    departingByEdu[edu] += depCount;
                    totalDeparting += depCount;
                    firedByEdu[edu] += firedCount;
                    ageDeparting += depCount;
                    ageFired += firedCount;
                    ageByEdu[edu] += depCount;
                    ageByEdu[edu] += firedCount;

                    if (m === 0) {
                        nextMonthDepartingByEdu[edu] += depCount;
                        nextMonthFiredByEdu[edu] += firedCount;
                    }
                }

                // Retired departing pipeline
                for (let m = 0; m < cat.departingRetired.length; m++) {
                    const retiredCount = cat.departingRetired[m] ?? 0;
                    retiredByEdu[edu] += retiredCount;
                    ageRetired += retiredCount;
                    ageByEdu[edu] += retiredCount;
                    if (m === 0) {
                        nextMonthRetiredByEdu[edu] += retiredCount;
                    }
                }

                // ---- XP attribution ----
                // Attribute workforceExperience proportionally across statuses
                // within this (edu, skill) cell.
                const xp = cat.workforceExperience;
                if (xp > 0) {
                    const sumVoluntary = sumArray(cat.voluntaryDeparting);
                    const sumFired = sumArray(cat.departingFired);
                    const sumRetired = sumArray(cat.departingRetired);
                    const totalWorkers = act + sumVoluntary + sumFired + sumRetired;

                    if (totalWorkers > 0) {
                        const xpActive = (xp * act) / totalWorkers;
                        const xpQuitting = (xp * sumVoluntary) / totalWorkers;
                        const xpFired = (xp * sumFired) / totalWorkers;
                        const xpRetired = (xp * sumRetired) / totalWorkers;

                        ageXPActive += xpActive;
                        ageXPDeparting += xpQuitting;
                        ageXPFired += xpFired;
                        ageXPRetired += xpRetired;
                        ageXPByEdu[edu] += xp;
                        xpSumByEdu[edu] += xp;
                    }
                }
            }
        }

        // Only include ages that have at least one worker
        if (ageActive + ageDeparting + ageFired + ageRetired > 0) {
            const quitting = ageDeparting;
            ageChartByStatus.push({ age, active: ageActive, quitting, fired: ageFired, retired: ageRetired });
            ageChartByEdu.push({ age, byEdu: { ...ageByEdu } });
        }

        // ---- Compute XP per capita (years of experience per worker) ----
        // XP=1 means 1 year of work. Divide all XP pools by the total
        // number of workers at this age so the stacked bars sum to
        // total XP / total workers = per-capita XP in years.
        // This keeps the total bar height invariant across view modes.

        const totalWorkers = ageActive + ageDeparting + ageFired + ageRetired;

        const xpPerCapitaActive = totalWorkers > 0 ? ageXPActive / totalWorkers : 0;
        const xpPerCapitaQuitting = totalWorkers > 0 ? ageXPDeparting / totalWorkers : 0;
        const xpPerCapitaFired = totalWorkers > 0 ? ageXPFired / totalWorkers : 0;
        const xpPerCapitaRetired = totalWorkers > 0 ? ageXPRetired / totalWorkers : 0;

        const hasXP = ageXPActive + ageXPDeparting + ageXPFired + ageXPRetired > 0 || totalWorkers > 0;

        if (hasXP) {
            experienceChartByStatus.push({
                age,
                active: xpPerCapitaActive,
                quitting: xpPerCapitaQuitting,
                fired: xpPerCapitaFired,
                retired: xpPerCapitaRetired,
            });

            const xpPerCapitaByEdu = {} as Record<EducationLevelType, number>;
            for (const edu of educationLevelKeys) {
                xpPerCapitaByEdu[edu] = totalWorkers > 0 ? (ageXPByEdu[edu] ?? 0) / totalWorkers : 0;
            }
            experienceChartByEdu.push({ age, byEdu: xpPerCapitaByEdu });
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

    // ---- Tenure (XP) stats ----
    // Mean tenure = total XP per edu / active worker count per edu
    const meanTenureByEdu = {} as Record<EducationLevelType, number>;
    const tenureProductivityByEdu = {} as Record<EducationLevelType, number>;
    let overallWeightedTenure = 0;

    for (const edu of educationLevelKeys) {
        const cnt = ageSumByEdu[edu].count;
        if (cnt > 0) {
            meanTenureByEdu[edu] = xpSumByEdu[edu] / cnt;
            tenureProductivityByEdu[edu] = productivityFromXP(meanTenureByEdu[edu]);
            overallWeightedTenure += xpSumByEdu[edu];
        } else {
            meanTenureByEdu[edu] = 0;
            tenureProductivityByEdu[edu] = 1.0;
        }
    }

    const overallMeanTenure = overallCount > 0 ? overallWeightedTenure / overallCount : 0;
    const overallTenureProductivity = overallCount > 0 ? productivityFromXP(overallMeanTenure) : 1.0;

    return {
        activeByEdu,
        departingByEdu,
        firedByEdu,
        voluntaryByEdu,
        nextMonthVoluntaryByEdu,
        nextMonthFiredByEdu,
        retiredByEdu,
        nextMonthRetiredByEdu,
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
        overallMeanTenure,
        overallTenureProductivity,
        ageChartByStatus,
        ageChartByEdu,
        experienceChartByStatus,
        experienceChartByEdu,
    };
}
