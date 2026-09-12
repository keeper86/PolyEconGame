import {
    ACCEPT_BASE,
    BASE_QUIT_RATE,
    MIN_EMPLOYABLE_AGE,
    QUIT_SENSITIVITY,
    SEARCH_HORIZON_TICKS,
    VACANCY_WAGE_SMOOTHING,
    WAGE_ACCEPT_FRACTION,
    WAGE_ACCEPT_SCALE,
    WAGE_DURATION_DECAY,
} from '../constants';
import type { Agent, Planet } from '../planet/planet';
import { hasActiveLicense } from '../planet/planet';
import { educationLevelKeys, type EducationLevelType } from '../population/education';
import { sumSlotFillByEdu } from './workforceAggregates';

export const ACCEPTABLE_IDLE_FRACTION = 0.05;

type PerEducation = Record<EducationLevelType, number>;

export type VacancyWageStep = {
    wage: number;
    cumVacancy: number;
    cumWage: number;
};

type PerEducationSteps = Record<EducationLevelType, VacancyWageStep[]>;

export type LaborMarket = {
    vacancies: PerEducation;
    unemployed: PerEducation;
    tightness: PerEducation;
    marketWage: PerEducation;
    vacancyWage: PerEducation;
    reachableVacancies: PerEducation;
    reachableTightness: PerEducation;
    reachableVacancyWage: PerEducation;
    reachableVacancySteps: PerEducationSteps;
};

export const jobFindingProbability = (tightness: number): number =>
    1 - Math.pow(1 - Math.min(1, tightness), SEARCH_HORIZON_TICKS);

export const outsideIncome = (tightness: number, vacancyWage: number): number =>
    jobFindingProbability(tightness) * vacancyWage;

export const acceptProbability = (wage: number, threshold: number): number =>
    ACCEPT_BASE / (1 + Math.exp(-(wage - threshold) / WAGE_ACCEPT_SCALE));

// A worker of a given education tier only takes a job that clears their personal
// reservation, formed from the going wage of their tier (reachableVacancyWage)
// discounted by how long they'd realistically have to search. Anchoring to the
// tier's own wage ladder (not to costOfLiving, which lags market-price spikes)
// and eroding the reservation with longer expected joblessness removes the
// wage/CoL refusal lock that otherwise turns a goods shortage into a labour
// collapse. See tools/longrun/labor-market-col-wedge.md.
export const reservationWage = (reachableTightness: number, reachableVacancyWage: number): number => {
    const jobProb = jobFindingProbability(reachableTightness);
    const expectedWaiting = jobProb > 0 ? 1 / jobProb : Number.POSITIVE_INFINITY;
    const durationDiscount = Math.pow(WAGE_DURATION_DECAY, expectedWaiting);
    return WAGE_ACCEPT_FRACTION * reachableVacancyWage * durationDiscount;
};

export const quitPropensity = (wage: number, tightness: number, vacancyWage: number): number => {
    const outside = outsideIncome(tightness, vacancyWage);
    const incomeGain = wage > 0 ? Math.max(0, outside - wage) / wage : 0;
    const raw = BASE_QUIT_RATE + QUIT_SENSITIVITY * incomeGain;
    return Math.min(raw, QUIT_RATE_CAP);
};

const QUIT_RATE_CAP = 0.002;

export const betterOfferStats = (
    steps: VacancyWageStep[],
    currentWage: number,
): { meanWage: number; share: number } => {
    if (steps.length === 0) {
        return { meanWage: 0, share: 0 };
    }
    let lo = 0;
    let hi = steps.length - 1;
    let ans = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (steps[mid].wage <= currentWage) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    const total = steps[steps.length - 1];
    if (ans === -1) {
        return { meanWage: total.cumWage / total.cumVacancy, share: 1 };
    }
    const below = steps[ans];
    const betterVacancy = total.cumVacancy - below.cumVacancy;
    if (betterVacancy <= 0) {
        return { meanWage: 0, share: 0 };
    }
    return {
        meanWage: (total.cumWage - below.cumWage) / betterVacancy,
        share: betterVacancy / total.cumVacancy,
    };
};

export const betterOfferMeanWage = (steps: VacancyWageStep[], currentWage: number): number =>
    betterOfferStats(steps, currentWage).meanWage;

export const computeLaborMarket = (agents: Map<string, Agent>, planet: Planet): LaborMarket => {
    const vacancies: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const unemployed: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const vacancyWageSum: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const reachableVacancies: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const reachableVacancyWageSum: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const reachableStepsRaw: Record<EducationLevelType, Array<{ wage: number; vacancy: number }>> = {
        none: [],
        primary: [],
        secondary: [],
        tertiary: [],
    };

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
        const slotFill = sumSlotFillByEdu(assets);
        const capacity = assets.totalSlotCapacity;
        for (const edu of educationLevelKeys) {
            const vacancy = Math.max(0, (capacity[edu] ?? 0) - slotFill[edu]);
            agentVacancies[edu] = vacancy;
            vacancies[edu] += vacancy;
            vacancyWageSum[edu] += vacancy * (assets.wagePerEdu[edu] ?? 0);
        }
        let cumulative = 0;
        for (const workerEdu of educationLevelKeys) {
            cumulative += agentVacancies[workerEdu];
            reachableVacancies[workerEdu] += cumulative;
            const agentWage = assets.wagePerEdu[workerEdu] ?? 0;
            reachableVacancyWageSum[workerEdu] += cumulative * agentWage;
            if (cumulative > 0) {
                reachableStepsRaw[workerEdu].push({ wage: agentWage, vacancy: cumulative });
            }
        }
    }

    const tightness: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const vacancyWage: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const reachableTightness: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const reachableVacancyWage: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const reachableVacancySteps: PerEducationSteps = { none: [], primary: [], secondary: [], tertiary: [] };
    for (const edu of educationLevelKeys) {
        tightness[edu] = vacancies[edu] / Math.max(1, unemployed[edu]);
        vacancyWage[edu] = vacancies[edu] > 0 ? vacancyWageSum[edu] / vacancies[edu] : 0;
        reachableTightness[edu] = reachableVacancies[edu] / Math.max(1, unemployed[edu]);
        reachableVacancyWage[edu] =
            reachableVacancies[edu] > 0 ? reachableVacancyWageSum[edu] / reachableVacancies[edu] : 0;
        const raw = reachableStepsRaw[edu].sort((a, b) => a.wage - b.wage);
        const steps: VacancyWageStep[] = [];
        let cumVacancy = 0;
        let cumWage = 0;
        for (const c of raw) {
            cumVacancy += c.vacancy;
            cumWage += c.vacancy * c.wage;
            steps.push({ wage: c.wage, cumVacancy, cumWage });
        }
        reachableVacancySteps[edu] = steps;
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
        reachableVacancySteps,
    };
};

export function updateSmoothedVacancyWage(agents: Map<string, Agent>, planet: Planet): void {
    const raw = computeLaborMarket(agents, planet);
    planet._smoothedReachableVacancyWage = emaPerEdu(raw.reachableVacancyWage, planet._smoothedReachableVacancyWage);
}

export function smoothedReachableVacancyWage(planet: Planet, edu: EducationLevelType, raw: number): number {
    return planet._smoothedReachableVacancyWage?.[edu] ?? raw;
}

function emaPerEdu(raw: PerEducation, prev: Partial<PerEducation> | undefined): PerEducation {
    const out: PerEducation = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    for (const edu of educationLevelKeys) {
        const previous = prev?.[edu] ?? raw[edu] ?? 0;
        out[edu] = VACANCY_WAGE_SMOOTHING * (raw[edu] ?? 0) + (1 - VACANCY_WAGE_SMOOTHING) * previous;
    }
    return out;
}
