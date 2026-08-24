import {
    INPUT_BUFFER_TARGET_TICKS,
    LOAN_MIN_ROLLOVER_PAYMENT_FRACTION,
    LOAN_SEIZURE_MAX_CONTRACT_FRACTION,
    MIN_WAGE,
    TICKS_PER_MONTH,
} from '../constants';
import { processFacilityContraction } from '../agents/recycler';
import { computeLoanConditions } from './loanConditions';
import type { Agent, AgentPlanetAssets, GameState, Planet } from '../planet/planet';
import { pushTickerEvent } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import type { Loan } from './loanTypes';
import { grantLoan, repayLoansOldestFirst, totalOutstandingLoans } from './loanTypes';
import { creditWageIncome } from './wealthOps';

export const DEFAULT_WAGE_PER_EDU = MIN_WAGE;

function estimateInputBufferCost(assets: AgentPlanetAssets, planet: Planet): number {
    let cost = 0;
    for (const facility of assets.productionFacilities) {
        for (const { resource, quantity } of facility.needs) {
            if (resource.form === 'landBoundResource') {
                continue;
            }
            const price = planet.marketPrices[resource.name];
            cost += quantity * facility.scale * INPUT_BUFFER_TARGET_TICKS * price;
        }
    }
    return cost;
}

export function preProductionFinancialTick(agents: Map<string, Agent>, planet: Planet, tick = 1): void {
    const bank = planet.bank;
    const demography = planet.population.demography;

    const weightedWageSum: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const totalPlanetWorkersForEdu: Record<EducationLevelType, number> = {
        none: 0,
        primary: 0,
        secondary: 0,
        tertiary: 0,
    };

    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }

        if (!assets.workforceDemography) {
            return;
        }

        const workforce = assets.workforceDemography;

        let wageBill = 0;
        const totalWorkersForEdu: Record<EducationLevelType, number> = {
            none: 0,
            primary: 0,
            secondary: 0,
            tertiary: 0,
        };

        // Single-pass workforce count
        for (let age = 0; age < workforce.length; age++) {
            const cohort = workforce[age];
            for (let li = 0; li < educationLevelKeys.length; li++) {
                const edu = educationLevelKeys[li];
                const cat = cohort[edu];
                const totalWorkers =
                    cat.active +
                    cat.onboarding[0] +
                    cat.onboarding[1] +
                    cat.onboarding[2] +
                    cat.voluntaryDeparting[0] +
                    cat.voluntaryDeparting[1] +
                    cat.voluntaryDeparting[2] +
                    cat.departingFired[0] +
                    cat.departingFired[1] +
                    cat.departingFired[2] +
                    cat.departingRetired[0] +
                    cat.departingRetired[1] +
                    cat.departingRetired[2];
                if (totalWorkers <= 0) {
                    continue;
                }
                totalWorkersForEdu[edu] += totalWorkers;
                wageBill += totalWorkers * assets.wagePerEdu[edu];
                weightedWageSum[edu] += assets.wagePerEdu[edu] * totalWorkers;
                totalPlanetWorkersForEdu[edu] += totalWorkers;
            }
        }

        if (wageBill <= 0) {
            return;
        }

        assets.monthAcc.wages += wageBill;
        const totalAgentWorkerCount =
            totalWorkersForEdu.none +
            totalWorkersForEdu.primary +
            totalWorkersForEdu.secondary +
            totalWorkersForEdu.tertiary;
        assets.monthAcc.totalWorkersTicks += totalAgentWorkerCount;

        if (assets.deposits < wageBill) {
            const shortfall = 6 * TICKS_PER_MONTH * wageBill - assets.deposits;
            grantLoan(assets, bank, shortfall, 'wageCoverage', tick);
        }

        assets.deposits -= wageBill;

        if (agent.automated) {
            const bufferCost = estimateInputBufferCost(assets, planet);
            if (bufferCost > 0 && assets.deposits < bufferCost) {
                const shortfall = TICKS_PER_MONTH * bufferCost - assets.deposits;
                grantLoan(assets, bank, shortfall, 'bufferCoverage', tick);
            }
        }

        const perCapitaWage = wageBill / totalAgentWorkerCount;
        for (let age = 0; age < workforce.length; age++) {
            const cohort = workforce[age];
            for (let li = 0; li < educationLevelKeys.length; li++) {
                const edu = educationLevelKeys[li];
                const cat = cohort[edu];
                const agentWorkersHere =
                    cat.active +
                    cat.onboarding[0] +
                    cat.onboarding[1] +
                    cat.onboarding[2] +
                    cat.voluntaryDeparting[0] +
                    cat.voluntaryDeparting[1] +
                    cat.voluntaryDeparting[2] +
                    cat.departingFired[0] +
                    cat.departingFired[1] +
                    cat.departingFired[2] +
                    cat.departingRetired[0] +
                    cat.departingRetired[1] +
                    cat.departingRetired[2];
                if (agentWorkersHere <= 0) {
                    continue;
                }
                const popCat = demography[age].employed[edu];
                if (popCat.total <= 0) {
                    continue;
                }
                creditWageIncome(bank, popCat, perCapitaWage, agentWorkersHere);
            }
        }
    });

    for (const edu of educationLevelKeys) {
        if (totalPlanetWorkersForEdu[edu] > 0) {
            planet.wagePerEdu[edu] = weightedWageSum[edu] / totalPlanetWorkersForEdu[edu];
        }
    }

    bank.equity = bank.deposits - bank.loans;
}

export const ROLLOVER_FEE_RATE = 0.05;

let loanDisciplineEnabled = false;
let loanRecyclingEnabled = false;

export function setLoanDisciplineEnabled(enabled: boolean): void {
    loanDisciplineEnabled = enabled;
}

export function setLoanRecyclingEnabled(enabled: boolean): void {
    loanRecyclingEnabled = enabled;
}

function seizeCapacityForDebt(
    planet: Planet,
    agent: Agent,
    assets: AgentPlanetAssets,
    gameState: GameState,
    targetAmount: number,
): number {
    const facilities = assets.productionFacilities
        .filter((facility) => facility.construction === null || facility.construction.type !== 'new')
        .filter((facility) => (facility.lastTickResults?.costBalance ?? 0) < 0)
        .sort((a, b) => (a.lastTickResults?.costBalance ?? 0) - (b.lastTickResults?.costBalance ?? 0));
    let raised = 0;
    for (const facility of facilities) {
        if (raised >= targetAmount) {
            break;
        }
        const targetMax = Math.max(1, Math.floor(facility.maxScale * (1 - LOAN_SEIZURE_MAX_CONTRACT_FRACTION)));
        if (targetMax >= facility.maxScale) {
            continue;
        }
        const before = assets.deposits;
        processFacilityContraction(planet, facility, agent, targetMax, gameState, 0, 1);
        raised += assets.deposits - before;
    }
    return raised;
}

export function maturesLoans(agents: Map<string, Agent>, planet: Planet, tick: number, gameState?: GameState): void {
    const bank = planet.bank;

    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }

        const maturedLoans: Loan[] = [];
        const remainingLoans: Loan[] = [];

        for (const loan of assets.activeLoans) {
            if (loan.maturityTick > 0 && tick >= loan.maturityTick) {
                maturedLoans.push(loan);
            } else {
                remainingLoans.push(loan);
            }
        }

        if (maturedLoans.length === 0) {
            return;
        }

        const totalDue = maturedLoans.reduce((sum, l) => sum + l.remainingPrincipal, 0);

        // If deposits are insufficient, borrow the shortfall so the agent can repay
        const shortfall = totalDue - assets.deposits;
        let writeOff = 0;
        if (shortfall > 0) {
            if (loanDisciplineEnabled) {
                const conditions = computeLoanConditions(agent, planet);
                if (shortfall > conditions.maxLoanAmount && conditions.monthlyNetCashFlow < 0) {
                    const minPayment = totalDue * LOAN_MIN_ROLLOVER_PAYMENT_FRACTION;
                    const raised =
                        gameState && loanRecyclingEnabled
                            ? seizeCapacityForDebt(planet, agent, assets, gameState, minPayment)
                            : 0;
                    const remainingShortfall = totalDue - assets.deposits;
                    if (raised >= minPayment && remainingShortfall > 0) {
                        remainingLoans.push(grantLoan(assets, bank, remainingShortfall, 'rollover', tick));
                    } else if (raised >= minPayment) {
                        // collateral covered the matured loan in full
                    } else {
                        planet.rolloverDenials += 1;
                        const repay = Math.min(totalDue, assets.deposits);
                        writeOff = totalDue - repay;
                        if (writeOff > 0) {
                            planet.debtWriteOffs += writeOff;
                            planet.bankruptcies += 1;
                            if (gameState) {
                                pushTickerEvent(gameState, {
                                    category: 'agentBankrupt',
                                    planetId: planet.id,
                                    agentId: agent.id,
                                    agentName: agent.name,
                                    message: `${agent.name} defaulted on ${Math.round(writeOff).toLocaleString()} of debt`,
                                    tick,
                                });
                            }
                        }
                    }
                } else {
                    remainingLoans.push(grantLoan(assets, bank, shortfall, 'rollover', tick));
                }
            } else {
                remainingLoans.push(grantLoan(assets, bank, shortfall, 'rollover', tick));
            }
        }

        // Repay all matured loans in full; the written-off portion is absorbed by the bank
        assets.deposits -= totalDue - writeOff;
        bank.loans -= totalDue;
        bank.deposits -= totalDue - writeOff;

        assets.activeLoans = remainingLoans;
    });

    bank.equity = bank.deposits - bank.loans;
}

export function automaticLoanRepayment(agents: Map<string, Agent>, planet: Planet): void {
    const bank = planet.bank;

    if (bank.loans <= 0) {
        return;
    }

    agents.forEach((agent) => {
        if (!agent.automated) {
            return;
        }
        if (agent.agentRole === 'arbitrage_trader' || agent.agentRole === 'shipbuilder') {
            return;
        }
        const assets = agent.assets[planet.id];
        if (!assets?.workforceDemography) {
            return;
        }
        const deposits = assets.deposits;
        const agentLoanTotal = totalOutstandingLoans(assets.activeLoans);
        if (deposits <= 0 || bank.loans <= 0 || agentLoanTotal <= 0) {
            return;
        }

        if (bank.loans < agentLoanTotal - 1e-6) {
            throw new Error(
                `Bank loan balance (${bank.loans}) is less than agent ${agent.id} loan principal (${agentLoanTotal}). ` +
                    `This should never happen and indicates a bug in the financial tick logic.`,
            );
        }

        const lastMonthExpenses =
            (assets.lastMonthAcc.wages ?? 0) +
            (assets.lastMonthAcc.purchases ?? 0) +
            (assets.lastMonthAcc.claimPayments ?? 0);

        const retainedThreshold = 12 * lastMonthExpenses;
        const excessDeposits = deposits - retainedThreshold;

        if (excessDeposits <= 0) {
            return;
        }

        const maxRepayment = Math.min(agentLoanTotal, excessDeposits);
        const actualRepayment = repayLoansOldestFirst(assets.activeLoans, maxRepayment);

        assets.deposits -= actualRepayment;
        bank.loans -= actualRepayment;
        bank.deposits -= actualRepayment;
    });
    bank.equity = bank.deposits - bank.loans;
}
