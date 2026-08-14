import { JOB_FINDING_TIGHTNESS_SCALE, MIN_EMPLOYABLE_AGE, TICKS_PER_MONTH, XP_WAGE_PREMIUM_SHARE } from '../constants';
import { computeCostOfLiving } from '../market/serviceDefinitions';
import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
import { hasActiveLicense, operatingProfit } from '../planet/planet';
import { educationLevelKeys, type EducationLevelType } from '../population/education';
import type { WorkforceCategoryIndex, WorkforceDemography } from './workforce';
import { productivityFromXP } from './workforce';
import { totalActiveForEdu, totalOnboardingForEdu } from './workforceAggregates';

export const ACCEPTABLE_IDLE_FRACTION = 0.05;

export const RESERVATION_WAGE_BASE_MULTIPLIER = 0.7;

export const REFERENCE_AGE = 25;

type PerEducation = Record<EducationLevelType, number>;

export type LaborMarket = {
    vacancies: PerEducation;
    unemployed: PerEducation;
    tightness: PerEducation;
    marketWage: PerEducation;
};

const ageMultiplier = (age: number): number => 1 + (age - 25) / 100;

const jobFindingWeight = (tightness: number): number => Math.min(1, tightness / JOB_FINDING_TIGHTNESS_SCALE);

export const buildBaseReservationWageMap = (planet: Planet): ((category: WorkforceCategoryIndex) => number) => {
    const costOfLiving = computeCostOfLiving(planet) * 2;
    const costOfLivingRich = computeCostOfLiving(planet, true) * 10;

    return (category: WorkforceCategoryIndex): number => {
        const baseWage = costOfLiving * RESERVATION_WAGE_BASE_MULTIPLIER * ageMultiplier(category.age);
        const requiredWage = Math.max(costOfLiving, baseWage);
        const requiredWageRich = Math.max(costOfLivingRich, baseWage) * 5;

        const qualificationFactor =
            0.5 * ((educationLevelKeys.indexOf(category.edu) + 1) / educationLevelKeys.length + 1 / 3);

        return requiredWage + qualificationFactor * (requiredWageRich - requiredWage);
    };
};

export const computeLaborMarket = (agents: Map<string, Agent>, planet: Planet): LaborMarket => {
    const vacancies: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const unemployed: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };

    const demography = planet.population.demography;
    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        for (const edu of educationLevelKeys) {
            unemployed[edu] += demography[age].unoccupied[edu].total;
        }
    }

    for (const agent of agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets || !hasActiveLicense(assets, 'workforce')) {
            continue;
        }
        const workforce = assets.workforceDemography;
        if (!workforce) {
            continue;
        }
        for (const edu of educationLevelKeys) {
            const target = assets.allocatedWorkers[edu] ?? 0;
            const current = totalActiveForEdu(workforce, edu) + totalOnboardingForEdu(workforce, edu);
            vacancies[edu] += Math.max(0, target - current);
        }
    }

    const tightness: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    for (const edu of educationLevelKeys) {
        tightness[edu] = vacancies[edu] / Math.max(1, unemployed[edu]);
    }

    return { vacancies, unemployed, tightness, marketWage: { ...planet.wagePerEdu } };
};

export const outsideOption = (
    costOfLivingMap: (category: WorkforceCategoryIndex) => number,
    age: number,
    edu: EducationLevelType,
    tightness: number,
    marketWage: number,
): number => {
    const costOfLiving = costOfLivingMap({ age, edu });
    const weight = jobFindingWeight(tightness);
    return costOfLiving + weight * Math.max(0, marketWage - costOfLiving);
};

export const reservationWage = (
    costOfLivingMap: (category: WorkforceCategoryIndex) => number,
    age: number,
    edu: EducationLevelType,
    xp: number,
    tightness: number,
    marketWage: number,
): number => {
    const outside = outsideOption(costOfLivingMap, age, edu, tightness, marketWage);
    const xpPremium = XP_WAGE_PREMIUM_SHARE * outside * (productivityFromXP(xp) - 1);
    return outside + xpPremium;
};

export const profitPerWorkerPerTick = (
    assets: AgentPlanetAssets,
    workforce: WorkforceDemography,
    tick: number,
): number => {
    const profitSignal = operatingProfit(assets.lastMonthAcc) + operatingProfit(assets.monthAcc);
    if (profitSignal <= 0) {
        return 0;
    }
    const windowTicks = TICKS_PER_MONTH + ((tick - 1) % TICKS_PER_MONTH);
    let activeHeadcount = 0;
    for (const edu of educationLevelKeys) {
        activeHeadcount += totalActiveForEdu(workforce, edu);
    }
    return profitSignal / windowTicks / Math.max(1, activeHeadcount);
};
