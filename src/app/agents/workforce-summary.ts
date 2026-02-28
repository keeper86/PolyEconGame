/**
 * Computes an aggregate summary of a WorkforceDemography array.
 * Pure logic — no React, no UI.
 */

import type { EducationLevelType, WorkforceDemography } from '../../simulation/planet';
import { educationLevelKeys } from '../../simulation/planet';
import {
    experienceMultiplier,
    ageProductivityMultiplier,
    MAX_TENURE_YEARS,
    DEFAULT_HIRE_AGE_MEAN,
} from '../../simulation/workforce';

// ---------------------------------------------------------------------------
// Summary type
// ---------------------------------------------------------------------------

export type WorkforceSummary = {
    activeByEdu: Record<EducationLevelType, number>;
    departingByEdu: Record<EducationLevelType, number>;
    retiringByEdu: Record<EducationLevelType, number>;
    /** Fired workers currently in the departing pipeline, per education level. */
    firedByEdu: Record<EducationLevelType, number>;
    /** Voluntary quitters in the departing pipeline (departing − fired), per education level. */
    voluntaryByEdu: Record<EducationLevelType, number>;
    /** Workers leaving next month (pipeline slot 0) per edu — voluntary quits. */
    nextMonthVoluntaryByEdu: Record<EducationLevelType, number>;
    /** Workers leaving next month (pipeline slot 0) per edu — fired. */
    nextMonthFiredByEdu: Record<EducationLevelType, number>;
    /** Workers leaving next month (pipeline slot 0) per edu — retiring. */
    nextMonthRetiringByEdu: Record<EducationLevelType, number>;
    totalActive: number;
    totalDeparting: number;
    totalRetiring: number;
    totalFired: number;
    totalVoluntary: number;
    avgExperienceMultiplier: number;

    tenureChart: {
        year: number;
        active: number;
        departing: number;
        retiring: number;
        fired: number;
        expMult: number;
        meanAge: number | null;
        variance: number | null;
    }[];

    /** Tenure distribution stacked by education level (active + departing per edu). */
    tenureChartByEdu: {
        year: number;
        /** Active workers per education level. */
        activeByEdu: Record<EducationLevelType, number>;
        /** Departing (on-notice) workers per education level. */
        departingByEdu: Record<EducationLevelType, number>;
    }[];

    meanAgeByEdu: Record<EducationLevelType, number>;
    ageProductivityByEdu: Record<EducationLevelType, number>;
    overallMeanAge: number;
    overallAgeProductivity: number;

    /** Weighted mean tenure (years) per education level. */
    meanTenureByEdu: Record<EducationLevelType, number>;
    /** Experience (tenure) productivity multiplier per education level. */
    tenureProductivityByEdu: Record<EducationLevelType, number>;
    /** Overall weighted mean tenure across all education levels. */
    overallMeanTenure: number;
    /** Overall tenure-based productivity multiplier. */
    overallTenureProductivity: number;

    ageDistribution: { age: number; [tenureBand: string]: number }[];
    tenureBandLabels: string[];

    /** Per-individual-tenure-year age distribution (for smooth gradient chart). */
    ageDistributionByYear: { age: number; [tenureYear: string]: number }[];
    /** Labels for each tenure year that has data, e.g. ["0y", "1y", …]. */
    tenureYearLabels: string[];
};

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

const TENURE_BANDS: { label: string; min: number; max: number }[] = [
    { label: '0–1y', min: 0, max: 1 },
    { label: '2–4y', min: 2, max: 4 },
    { label: '5–9y', min: 5, max: 9 },
    { label: '10–19y', min: 10, max: 19 },
    { label: '20+y', min: 20, max: MAX_TENURE_YEARS },
];

export function computeSummary(workforce: WorkforceDemography): WorkforceSummary {
    const activeByEdu = {} as Record<EducationLevelType, number>;
    const departingByEdu = {} as Record<EducationLevelType, number>;
    const retiringByEdu = {} as Record<EducationLevelType, number>;
    const firedByEdu = {} as Record<EducationLevelType, number>;
    // Slot-0 (next-month exit) accumulators
    const nextMonthDepartingByEdu = {} as Record<EducationLevelType, number>;
    const nextMonthFiredByEdu = {} as Record<EducationLevelType, number>;
    const nextMonthRetiringByEdu = {} as Record<EducationLevelType, number>;
    for (const edu of educationLevelKeys) {
        activeByEdu[edu] = 0;
        departingByEdu[edu] = 0;
        retiringByEdu[edu] = 0;
        firedByEdu[edu] = 0;
        nextMonthDepartingByEdu[edu] = 0;
        nextMonthFiredByEdu[edu] = 0;
        nextMonthRetiringByEdu[edu] = 0;
    }

    let totalActive = 0;
    let totalDeparting = 0;
    let totalRetiring = 0;
    let weightedExp = 0;

    const ageSumByEdu = {} as Record<EducationLevelType, { count: number; weightedMean: number; weightedVar: number }>;
    for (const edu of educationLevelKeys) {
        ageSumByEdu[edu] = { count: 0, weightedMean: 0, weightedVar: 0 };
    }

    const tenureChart: WorkforceSummary['tenureChart'] = [];
    const tenureChartByEdu: WorkforceSummary['tenureChartByEdu'] = [];

    for (let year = 0; year <= MAX_TENURE_YEARS; year++) {
        const cohort = workforce[year];
        if (!cohort) {
            continue;
        }

        let yearActive = 0;
        let yearDeparting = 0;
        let yearRetiring = 0;
        let yearFired = 0;
        const yearActiveByEdu = {} as Record<EducationLevelType, number>;
        const yearDepartingByEdu = {} as Record<EducationLevelType, number>;

        for (const edu of educationLevelKeys) {
            const act = cohort.active[edu] ?? 0;
            activeByEdu[edu] += act;
            yearActive += act;
            yearActiveByEdu[edu] = act;

            const dep = (cohort.departing[edu] ?? []).reduce((s, v) => s + v, 0);
            departingByEdu[edu] += dep;
            yearDeparting += dep;
            yearDepartingByEdu[edu] = dep;

            const ret = (cohort.retiring?.[edu] ?? []).reduce((s: number, v: number) => s + v, 0);
            retiringByEdu[edu] += ret;
            yearRetiring += ret;

            const fired = (cohort.departingFired?.[edu] ?? []).reduce((s: number, v: number) => s + v, 0);
            firedByEdu[edu] += fired;
            yearFired += fired;

            // Slot 0 = workers whose notice expires next month
            nextMonthDepartingByEdu[edu] += cohort.departing[edu]?.[0] ?? 0;
            nextMonthFiredByEdu[edu] += cohort.departingFired?.[edu]?.[0] ?? 0;
            nextMonthRetiringByEdu[edu] += cohort.retiring?.[edu]?.[0] ?? 0;

            if (act > 0 && cohort.ageMoments?.[edu]) {
                const m = cohort.ageMoments[edu];
                ageSumByEdu[edu].weightedMean += act * m.mean;
                ageSumByEdu[edu].weightedVar += act * m.variance;
                ageSumByEdu[edu].count += act;
            }
        }

        totalActive += yearActive;
        totalDeparting += yearDeparting;
        totalRetiring += yearRetiring;
        weightedExp += yearActive * experienceMultiplier(year);

        if (yearActive > 0 || yearDeparting > 0 || yearRetiring > 0) {
            let yearWeightedAge = 0;
            let yearWeightedVar = 0;
            let yearAgeCount = 0;
            for (const edu of educationLevelKeys) {
                const act = cohort.active[edu] ?? 0;
                if (act > 0 && cohort.ageMoments?.[edu]) {
                    const m = cohort.ageMoments[edu];
                    yearWeightedAge += act * m.mean;
                    yearWeightedVar += act * m.variance;
                    yearAgeCount += act;
                }
            }

            tenureChart.push({
                year,
                active: yearActive,
                departing: yearDeparting,
                retiring: yearRetiring,
                fired: yearFired,
                expMult: experienceMultiplier(year),
                meanAge: yearAgeCount > 0 ? yearWeightedAge / yearAgeCount : null,
                variance: yearAgeCount > 0 ? yearWeightedVar / yearAgeCount : null,
            });
            tenureChartByEdu.push({
                year,
                activeByEdu: yearActiveByEdu,
                departingByEdu: yearDepartingByEdu,
            });
        }
    }

    const avgExperienceMultiplier = totalActive > 0 ? weightedExp / totalActive : 1.0;

    // ---- Per-education age stats ----
    const meanAgeByEdu = {} as Record<EducationLevelType, number>;
    const ageProductivityByEdu = {} as Record<EducationLevelType, number>;
    let overallWeightedAge = 0;
    let overallCount = 0;

    for (const edu of educationLevelKeys) {
        const s = ageSumByEdu[edu];
        if (s.count > 0) {
            meanAgeByEdu[edu] = s.weightedMean / s.count;
            ageProductivityByEdu[edu] = ageProductivityMultiplier(meanAgeByEdu[edu]);
            overallWeightedAge += s.weightedMean;
            overallCount += s.count;
        } else {
            meanAgeByEdu[edu] = DEFAULT_HIRE_AGE_MEAN;
            ageProductivityByEdu[edu] = ageProductivityMultiplier(DEFAULT_HIRE_AGE_MEAN);
        }
    }

    const overallMeanAge = overallCount > 0 ? overallWeightedAge / overallCount : DEFAULT_HIRE_AGE_MEAN;
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

    // ---- Per-education tenure stats ----
    const meanTenureByEdu = {} as Record<EducationLevelType, number>;
    const tenureProductivityByEdu = {} as Record<EducationLevelType, number>;
    const tenureSumByEdu = {} as Record<EducationLevelType, { count: number; weightedTenure: number }>;
    for (const edu of educationLevelKeys) {
        tenureSumByEdu[edu] = { count: 0, weightedTenure: 0 };
    }
    for (let year = 0; year <= MAX_TENURE_YEARS; year++) {
        const cohort = workforce[year];
        if (!cohort) {
            continue;
        }
        for (const edu of educationLevelKeys) {
            const act = cohort.active[edu] ?? 0;
            if (act > 0) {
                tenureSumByEdu[edu].weightedTenure += act * year;
                tenureSumByEdu[edu].count += act;
            }
        }
    }
    let overallTenureWeighted = 0;
    let overallTenureCount = 0;
    for (const edu of educationLevelKeys) {
        const s = tenureSumByEdu[edu];
        if (s.count > 0) {
            meanTenureByEdu[edu] = s.weightedTenure / s.count;
            tenureProductivityByEdu[edu] = experienceMultiplier(meanTenureByEdu[edu]);
            overallTenureWeighted += s.weightedTenure;
            overallTenureCount += s.count;
        } else {
            meanTenureByEdu[edu] = 0;
            tenureProductivityByEdu[edu] = experienceMultiplier(0);
        }
    }
    const overallMeanTenure = overallTenureCount > 0 ? overallTenureWeighted / overallTenureCount : 0;
    const overallTenureProductivity = experienceMultiplier(overallMeanTenure);

    // ---- Age distribution (Gaussian approximation from moments) ----
    const tenureBandLabels = TENURE_BANDS.map((b) => b.label);

    const bandStats = TENURE_BANDS.map((band) => {
        let count = 0;
        let weightedMean = 0;
        let weightedVar = 0;
        for (let year = band.min; year <= Math.min(band.max, MAX_TENURE_YEARS); year++) {
            const cohort = workforce[year];
            if (!cohort) {
                continue;
            }
            for (const edu of educationLevelKeys) {
                const act = cohort.active[edu] ?? 0;
                if (act > 0 && cohort.ageMoments?.[edu]) {
                    const m = cohort.ageMoments[edu];
                    weightedMean += act * m.mean;
                    weightedVar += act * m.variance;
                    count += act;
                }
            }
        }
        return { count, mean: count > 0 ? weightedMean / count : 0, variance: count > 0 ? weightedVar / count : 0 };
    });

    const ageDistribution: WorkforceSummary['ageDistribution'] = [];
    const MIN_AGE_PLOT = 14;
    const MAX_AGE_PLOT = 80;

    for (let age = MIN_AGE_PLOT; age <= MAX_AGE_PLOT; age++) {
        const row: { age: number; [band: string]: number } = { age };
        for (let b = 0; b < TENURE_BANDS.length; b++) {
            const label = tenureBandLabels[b];
            const s = bandStats[b];
            if (s.count === 0) {
                row[label] = 0;
                continue;
            }
            const variance = Math.max(1, s.variance);
            const stdDev = Math.sqrt(variance);
            const density =
                (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((age - s.mean) / stdDev, 2));
            row[label] = Math.round(density * s.count);
        }
        ageDistribution.push(row);
    }

    // ---- Per-tenure-year age distribution (smooth gradient chart) ----
    const perYearStats: { year: number; count: number; mean: number; variance: number }[] = [];
    for (let year = 0; year <= MAX_TENURE_YEARS; year++) {
        const cohort = workforce[year];
        if (!cohort) {
            continue;
        }
        let count = 0;
        let weightedMean = 0;
        let weightedVar = 0;
        for (const edu of educationLevelKeys) {
            const act = cohort.active[edu] ?? 0;
            if (act > 0 && cohort.ageMoments?.[edu]) {
                const m = cohort.ageMoments[edu];
                weightedMean += act * m.mean;
                weightedVar += act * m.variance;
                count += act;
            }
        }
        if (count > 0) {
            perYearStats.push({
                year,
                count,
                mean: weightedMean / count,
                variance: weightedVar / count,
            });
        }
    }

    const tenureYearLabels = perYearStats.map((s) => `${s.year}y`);

    const ageDistributionByYear: WorkforceSummary['ageDistributionByYear'] = [];
    for (let age = MIN_AGE_PLOT; age <= MAX_AGE_PLOT; age++) {
        const row: { age: number; [key: string]: number } = { age };
        for (const s of perYearStats) {
            const label = `${s.year}y`;
            const variance = Math.max(1, s.variance);
            const stdDev = Math.sqrt(variance);
            const density =
                (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((age - s.mean) / stdDev, 2));
            row[label] = Math.round(density * s.count);
        }
        ageDistributionByYear.push(row);
    }

    return {
        activeByEdu,
        departingByEdu,
        retiringByEdu,
        firedByEdu,
        voluntaryByEdu,
        nextMonthVoluntaryByEdu,
        nextMonthFiredByEdu,
        nextMonthRetiringByEdu,
        totalActive,
        totalDeparting,
        totalRetiring,
        totalFired,
        totalVoluntary,
        avgExperienceMultiplier,
        tenureChart,
        tenureChartByEdu,
        meanAgeByEdu,
        ageProductivityByEdu,
        overallMeanAge,
        overallAgeProductivity,
        meanTenureByEdu,
        tenureProductivityByEdu,
        overallMeanTenure,
        overallTenureProductivity,
        ageDistribution,
        tenureBandLabels,
        ageDistributionByYear,
        tenureYearLabels,
    };
}
