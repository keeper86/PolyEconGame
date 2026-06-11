'use client';

import type { EducationLevelType } from '@/simulation/population/education';
import { educationLevelKeys } from '@/simulation/population/education';
import type { WorkforceCohort, WorkforceCategory } from '@/simulation/workforce/workforce';
import { productivityFromXP } from '@/simulation/workforce/workforce';
import { MAX_AGE, SKILL } from '@/simulation/population/population';
import { ageProductivityMultiplier } from '@/simulation/planet/production';

export type WorkforceDemography = WorkforceCohort<WorkforceCategory>[];

export type WorkforceSummary = {
    activeByEdu: Record<EducationLevelType, number>;
    onboardingByEdu: Record<EducationLevelType, number>;
    nextMonthOnboardingByEdu: Record<EducationLevelType, number>;
    departingByEdu: Record<EducationLevelType, number>;

    firedByEdu: Record<EducationLevelType, number>;

    voluntaryByEdu: Record<EducationLevelType, number>;

    nextMonthVoluntaryByEdu: Record<EducationLevelType, number>;

    nextMonthFiredByEdu: Record<EducationLevelType, number>;

    retiredByEdu: Record<EducationLevelType, number>;

    nextMonthRetiredByEdu: Record<EducationLevelType, number>;
    totalActive: number;
    totalOnboarding: number;
    totalDeparting: number;
    totalFired: number;
    totalVoluntary: number;
    avgExperienceMultiplier: number;

    meanAgeByEdu: Record<EducationLevelType, number>;

    ageProductivityByEdu: Record<EducationLevelType, number>;

    overallMeanAge: number;

    overallAgeProductivity: number;

    meanTenureByEdu: Record<EducationLevelType, number>;

    tenureProductivityByEdu: Record<EducationLevelType, number>;

    overallMeanTenure: number;

    overallTenureProductivity: number;

    ageChartByStatus: {
        age: number;
        active: number;
        onboarding: number;
        quitting: number;
        fired: number;
        retired: number;
    }[];

    ageChartByEdu: {
        age: number;
        byEdu: Record<EducationLevelType, number>;
    }[];

    experienceChartByStatus: {
        age: number;
        active: number;
        onboarding: number;
        quitting: number;
        fired: number;
        retired: number;
    }[];

    experienceChartByEdu: {
        age: number;
        byEdu: Record<EducationLevelType, number>;
    }[];
};

function sumArray(arr: number[]): number {
    return arr.reduce((s, v) => s + v, 0);
}

export function computeSummary(workforce: WorkforceDemography): WorkforceSummary {
    const activeByEdu = {} as Record<EducationLevelType, number>;
    const onboardingByEdu = {} as Record<EducationLevelType, number>;
    const nextMonthOnboardingByEdu = {} as Record<EducationLevelType, number>;
    const departingByEdu = {} as Record<EducationLevelType, number>;
    const firedByEdu = {} as Record<EducationLevelType, number>;
    const nextMonthDepartingByEdu = {} as Record<EducationLevelType, number>;
    const nextMonthFiredByEdu = {} as Record<EducationLevelType, number>;
    const retiredByEdu = {} as Record<EducationLevelType, number>;
    const nextMonthRetiredByEdu = {} as Record<EducationLevelType, number>;
    for (const edu of educationLevelKeys) {
        activeByEdu[edu] = 0;
        onboardingByEdu[edu] = 0;
        nextMonthOnboardingByEdu[edu] = 0;
        departingByEdu[edu] = 0;
        firedByEdu[edu] = 0;
        nextMonthDepartingByEdu[edu] = 0;
        nextMonthFiredByEdu[edu] = 0;
        retiredByEdu[edu] = 0;
        nextMonthRetiredByEdu[edu] = 0;
    }

    let totalActive = 0;
    let totalOnboarding = 0;
    let totalDeparting = 0;

    const ageSumByEdu = {} as Record<EducationLevelType, { count: number; weightedAge: number }>;
    for (const edu of educationLevelKeys) {
        ageSumByEdu[edu] = { count: 0, weightedAge: 0 };
    }

    const xpSumByEdu = {} as Record<EducationLevelType, number>;
    for (const edu of educationLevelKeys) {
        xpSumByEdu[edu] = 0;
    }

    const ageChartByStatus: WorkforceSummary['ageChartByStatus'] = [];
    const ageChartByEdu: WorkforceSummary['ageChartByEdu'] = [];

    const experienceChartByStatus: WorkforceSummary['experienceChartByStatus'] = [];
    const experienceChartByEdu: WorkforceSummary['experienceChartByEdu'] = [];

    for (let age = 0; age <= Math.min(MAX_AGE, workforce.length - 1); age++) {
        const cohort = workforce[age];
        if (!cohort) {
            continue;
        }

        let ageActive = 0;
        let ageOnboarding = 0;
        let ageDeparting = 0;
        let ageFired = 0;
        let ageRetired = 0;
        const ageByEdu = {} as Record<EducationLevelType, number>;
        for (const edu of educationLevelKeys) {
            ageByEdu[edu] = 0;
        }

        let ageXPActive = 0;
        let ageXPOnboarding = 0;
        let ageXPDeparting = 0;
        let ageXPFired = 0;
        let ageXPRetired = 0;
        const ageXPByEdu = {} as Record<EducationLevelType, number>;
        for (const edu of educationLevelKeys) {
            ageXPByEdu[edu] = 0;
        }

        for (const edu of educationLevelKeys) {
            for (const skill of SKILL) {
                const cat = cohort[edu][skill];
                const act = cat.active;
                const onb = sumArray(cat.onboarding);
                const onbNext = cat.onboarding[cat.onboarding.length - 1] ?? 0;

                activeByEdu[edu] += act;
                onboardingByEdu[edu] += onb;
                nextMonthOnboardingByEdu[edu] += onbNext;
                totalActive += act;
                totalOnboarding += onb;
                ageActive += act;
                ageOnboarding += onb;
                ageByEdu[edu] += act + onb;

                if (act > 0) {
                    ageSumByEdu[edu].weightedAge += act * age;
                    ageSumByEdu[edu].count += act;
                }

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

                for (let m = 0; m < cat.departingRetired.length; m++) {
                    const retiredCount = cat.departingRetired[m] ?? 0;
                    retiredByEdu[edu] += retiredCount;
                    ageRetired += retiredCount;
                    ageByEdu[edu] += retiredCount;
                    if (m === 0) {
                        nextMonthRetiredByEdu[edu] += retiredCount;
                    }
                }

                const xp = cat.workforceExperience;
                if (xp > 0) {
                    const sumOnboarding = sumArray(cat.onboarding);
                    const sumVoluntary = sumArray(cat.voluntaryDeparting);
                    const sumFired = sumArray(cat.departingFired);
                    const sumRetired = sumArray(cat.departingRetired);
                    const totalWorkers = act + sumOnboarding + sumVoluntary + sumFired + sumRetired;

                    if (totalWorkers > 0) {
                        const xpActive = (xp * act) / totalWorkers;
                        const xpOnboarding = (xp * sumOnboarding) / totalWorkers;
                        const xpQuitting = (xp * sumVoluntary) / totalWorkers;
                        const xpFired = (xp * sumFired) / totalWorkers;
                        const xpRetired = (xp * sumRetired) / totalWorkers;

                        ageXPActive += xpActive;
                        ageXPOnboarding += xpOnboarding;
                        ageXPDeparting += xpQuitting;
                        ageXPFired += xpFired;
                        ageXPRetired += xpRetired;
                        ageXPByEdu[edu] += xp;
                        xpSumByEdu[edu] += xp;
                    }
                }
            }
        }

        if (ageActive + ageOnboarding + ageDeparting + ageFired + ageRetired > 0) {
            const quitting = ageDeparting;
            ageChartByStatus.push({
                age,
                active: ageActive,
                onboarding: ageOnboarding,
                quitting,
                fired: ageFired,
                retired: ageRetired,
            });
            ageChartByEdu.push({ age, byEdu: { ...ageByEdu } });
        }

        const totalWorkers = ageActive + ageOnboarding + ageDeparting + ageFired + ageRetired;

        const xpPerCapitaActive = totalWorkers > 0 ? ageXPActive / totalWorkers : 0;
        const xpPerCapitaOnboarding = totalWorkers > 0 ? ageXPOnboarding / totalWorkers : 0;
        const xpPerCapitaQuitting = totalWorkers > 0 ? ageXPDeparting / totalWorkers : 0;
        const xpPerCapitaFired = totalWorkers > 0 ? ageXPFired / totalWorkers : 0;
        const xpPerCapitaRetired = totalWorkers > 0 ? ageXPRetired / totalWorkers : 0;

        const hasXP =
            ageXPActive + ageXPOnboarding + ageXPDeparting + ageXPFired + ageXPRetired > 0 || totalWorkers > 0;

        if (hasXP) {
            experienceChartByStatus.push({
                age,
                active: xpPerCapitaActive,
                onboarding: xpPerCapitaOnboarding,
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

    const totalFired = educationLevelKeys.reduce((sum, edu) => sum + firedByEdu[edu], 0);
    const voluntaryByEdu = {} as Record<EducationLevelType, number>;
    const nextMonthVoluntaryByEdu = {} as Record<EducationLevelType, number>;
    for (const edu of educationLevelKeys) {
        voluntaryByEdu[edu] = Math.max(0, departingByEdu[edu] - firedByEdu[edu]);
        nextMonthVoluntaryByEdu[edu] = Math.max(0, nextMonthDepartingByEdu[edu] - nextMonthFiredByEdu[edu]);
    }
    const totalVoluntary = educationLevelKeys.reduce((sum, edu) => sum + voluntaryByEdu[edu], 0);

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
        onboardingByEdu,
        nextMonthOnboardingByEdu,
        departingByEdu,
        firedByEdu,
        voluntaryByEdu,
        nextMonthVoluntaryByEdu,
        nextMonthFiredByEdu,
        retiredByEdu,
        nextMonthRetiredByEdu,
        totalActive,
        totalOnboarding,
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
