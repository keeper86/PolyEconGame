import {
    ACCEPT_BASE,
    BASE_QUIT_RATE,
    MIN_EMPLOYABLE_AGE,
    QUIT_SENSITIVITY,
    SEARCH_HORIZON_TICKS,
    WAGE_ACCEPT_SCALE,
} from '../constants';
import type { Agent, Planet } from '../planet/planet';
import { hasActiveLicense } from '../planet/planet';
import { educationLevelKeys, type EducationLevelType } from '../population/education';
import { sumTotalUsedByEdu } from './workforceAggregates';

export const ACCEPTABLE_IDLE_FRACTION = 0.05;

type PerEducation = Record<EducationLevelType, number>;

export type LaborMarket = {
    vacancies: PerEducation;
    unemployed: PerEducation;
    tightness: PerEducation;
    marketWage: PerEducation;
    vacancyWage: PerEducation;
    reachableVacancies: PerEducation;
    reachableTightness: PerEducation;
    reachableVacancyWage: PerEducation;
};

export const jobFindingProbability = (tightness: number): number =>
    1 - Math.pow(1 - Math.min(1, tightness), SEARCH_HORIZON_TICKS);

export const outsideIncome = (tightness: number, vacancyWage: number): number =>
    jobFindingProbability(tightness) * vacancyWage;

export const acceptProbability = (wage: number, threshold: number): number =>
    ACCEPT_BASE / (1 + Math.exp(-(wage - threshold) / WAGE_ACCEPT_SCALE));

export const quitPropensity = (wage: number, tightness: number, vacancyWage: number): number => {
    const outside = outsideIncome(tightness, vacancyWage);
    const incomeGain = wage > 0 ? Math.max(0, outside - wage) / wage : 0;
    return BASE_QUIT_RATE + QUIT_SENSITIVITY * incomeGain;
};

export const computeLaborMarket = (agents: Map<string, Agent>, planet: Planet): LaborMarket => {
    const vacancies: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const unemployed: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const vacancyWageSum: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const reachableVacancies: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const reachableVacancyWageSum: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };

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
        const agentVacancies: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
        const slotsFilled = sumTotalUsedByEdu(assets);
        for (const edu of educationLevelKeys) {
            const target = assets.allocatedWorkers[edu] ?? 0;
            const vacancy = Math.max(0, target - slotsFilled[edu]);
            agentVacancies[edu] = vacancy;
            vacancies[edu] += vacancy;
            vacancyWageSum[edu] += vacancy * (assets.wagePerEdu[edu] ?? 0);
        }
        let cumulative = 0;
        for (const workerEdu of educationLevelKeys) {
            cumulative += agentVacancies[workerEdu];
            reachableVacancies[workerEdu] += cumulative;
            reachableVacancyWageSum[workerEdu] += cumulative * (assets.wagePerEdu[workerEdu] ?? 0);
        }
    }

    const tightness: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const vacancyWage: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const reachableTightness: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const reachableVacancyWage: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    for (const edu of educationLevelKeys) {
        tightness[edu] = vacancies[edu] / Math.max(1, unemployed[edu]);
        vacancyWage[edu] = vacancies[edu] > 0 ? vacancyWageSum[edu] / vacancies[edu] : 0;
        reachableTightness[edu] = reachableVacancies[edu] / Math.max(1, unemployed[edu]);
        reachableVacancyWage[edu] =
            reachableVacancies[edu] > 0 ? reachableVacancyWageSum[edu] / reachableVacancies[edu] : 0;
    }

    return {
        vacancies,
        unemployed,
        tightness,
        marketWage: { ...planet.wagePerEdu },
        vacancyWage,
        reachableVacancies,
        reachableTightness,
        reachableVacancyWage,
    };
};
