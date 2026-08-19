import {
    CHURN_WAGE_WEIGHT,
    MAX_WAGE,
    MIN_EMPLOYABLE_AGE,
    MIN_WAGE,
    PREMIUM_DAMPEN_GAIN,
    PREMIUM_DAMPEN_THRESHOLD,
    WAGE_ADJUSTMENT_RATE,
    WAGE_FEEDBACK_GAIN,
    WAGE_NEUTRAL_PRESSURE,
} from '../constants';
import { creditWageIncome } from '../financial/wealthOps';
import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { ACCEPTABLE_IDLE_FRACTION, computeLaborMarket, outsideIncome } from './laborMarket';
import { sumTotalUsedByEdu, totalActiveForEdu } from './workforceAggregates';

function unemployedByEdu(planet: Planet): Record<EducationLevelType, number> {
    const unoccupied: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const demography = planet.population.demography;
    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        for (const edu of educationLevelKeys) {
            unoccupied[edu] += demography[age].unoccupied[edu].total;
        }
    }
    return unoccupied;
}

function dampenPremium(current: number, market: number): number {
    if (market <= 0) {
        return 1;
    }
    const premium = current / market;
    if (premium <= PREMIUM_DAMPEN_THRESHOLD) {
        return 1;
    }
    return 1 / (1 + (premium - PREMIUM_DAMPEN_THRESHOLD) * PREMIUM_DAMPEN_GAIN);
}

export function automaticWorkerAllocation(agents: Map<string, Agent>, planet: Planet): void {
    const unoccupied = unemployedByEdu(planet);
    for (const agent of agents.values()) {
        if (!agent.automated && !agent.automateWorkerAllocation) {
            continue;
        }
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }

        const totalSlotCapacity: Record<EducationLevelType, number> = assets.totalSlotCapacity ?? {
            none: 0,
            primary: 0,
            secondary: 0,
            tertiary: 0,
        };

        const totalUsed = sumTotalUsedByEdu(assets);

        const newTarget: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
        let shortfallToCascade = 0;
        for (const edu of educationLevelKeys) {
            const deficit = Math.max(0, totalSlotCapacity[edu] - totalUsed[edu]);
            const needed = deficit + shortfallToCascade;

            let target = totalUsed[edu] + needed;
            target = Math.ceil(target * (1 + ACCEPTABLE_IDLE_FRACTION));
            newTarget[edu] = target;
            shortfallToCascade = Math.max(0, needed - unoccupied[edu]);
        }

        assets.allocatedWorkers = newTarget;
    }
}

function computeReservationCapital(assets: AgentPlanetAssets): number {
    const lastMonthWages = assets.lastMonthAcc.wages ?? 0;
    const lastMonthPurchases = assets.lastMonthAcc.purchases ?? 0;
    const lastClaims = assets.lastMonthAcc.claimPayments ?? 0;
    const monthlyRunRate = lastMonthWages + lastMonthPurchases + lastClaims;
    const effectiveMonthlyRunRate = monthlyRunRate > 0 ? monthlyRunRate : Number.MAX_SAFE_INTEGER;
    return effectiveMonthlyRunRate * 12;
}

export function automaticWageAdjustment(agents: Map<string, Agent>, planet: Planet): void {
    const bank = planet.bank;
    const demography = planet.population.demography;
    const laborMarket = computeLaborMarket(agents, planet);

    for (const agent of agents.values()) {
        if (!agent.automated && !agent.automateWorkerAllocation) {
            continue;
        }
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }
        const workforce = assets.workforceDemography;
        if (!workforce) {
            continue;
        }

        const slotsFilled = sumTotalUsedByEdu(assets);

        for (const edu of educationLevelKeys) {
            const current = assets.wagePerEdu[edu] ?? MIN_WAGE;

            const capacity = assets.totalSlotCapacity?.[edu] ?? 0;
            const shortage = Math.max(0, capacity - slotsFilled[edu]) / Math.max(1, capacity);
            const shortagePressure = shortage * shortage;

            const outside = outsideIncome(laborMarket.reachableTightness[edu], laborMarket.reachableVacancyWage[edu]);
            const incomeGain = current > 0 ? Math.max(0, outside - current) / current : 0;
            const premiumDampener = dampenPremium(current, outside);
            const pressure = premiumDampener * (shortagePressure + CHURN_WAGE_WEIGHT * incomeGain) - WAGE_NEUTRAL_PRESSURE;

            const maxStep = WAGE_ADJUSTMENT_RATE * current;
            const step = Math.max(-maxStep, Math.min(maxStep, WAGE_FEEDBACK_GAIN * current * pressure));
            assets.wagePerEdu[edu] = Math.max(MIN_WAGE, Math.min(MAX_WAGE, current + step));
        }

        for (let i = 0; i < educationLevelKeys.length - 1; i++) {
            const currentEdu = educationLevelKeys[i];
            const nextEdu = educationLevelKeys[i + 1];
            if (assets.wagePerEdu[currentEdu] > assets.wagePerEdu[nextEdu]) {
                assets.wagePerEdu[nextEdu] = assets.wagePerEdu[currentEdu];
            }
        }

        if (agent.automated && agent.id !== planet.governmentId) {
            const netBalance =
                assets.deposits - assets.activeLoans.reduce((sum, loan) => sum + loan.remainingPrincipal, 0);
            const reservationCapital = computeReservationCapital(assets);
            const excessCash = netBalance - reservationCapital;

            if (excessCash > 0) {
                let totalWorkers = 0;
                for (const edu of educationLevelKeys) {
                    totalWorkers += totalActiveForEdu(workforce, edu);
                }

                let totalCredit = 0;
                if (totalWorkers > 0) {
                    const perWorkerBonus = excessCash / totalWorkers;
                    for (let age = 0; age < workforce.length; age++) {
                        const ageCohort = workforce[age];
                        if (!ageCohort) {
                            continue;
                        }
                        for (const edu of educationLevelKeys) {
                            const agentWorkers = ageCohort[edu];
                            if (!agentWorkers) {
                                continue;
                            }
                            const activeWorkers = agentWorkers.active;
                            if (activeWorkers <= 0) {
                                continue;
                            }
                            const cat = demography[age].employed[edu];
                            if (cat.total <= 0) {
                                continue;
                            }
                            totalCredit += creditWageIncome(bank, cat, perWorkerBonus, activeWorkers);
                        }
                    }

                    if (Math.abs(totalCredit - excessCash) / excessCash > 1e-6) {
                        console.error(
                            `[automaticWageAdjustment] profit-sharing accounting mismatch: ` +
                                `excessCash=${excessCash.toFixed(4)}, ` +
                                `totalCredit=${totalCredit.toFixed(4)}, ` +
                                `diff=${(totalCredit - excessCash).toFixed(6)}`,
                        );
                    }
                }

                assets.monthAcc.profitShareBonuses += totalCredit;
                assets.deposits -= totalCredit;
            }
        }
    }
}
