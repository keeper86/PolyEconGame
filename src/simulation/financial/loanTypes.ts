import { TICKS_PER_YEAR } from '../constants';
import type { Bank } from '../planet/planet';
import type { AgentPlanetAssets } from '../planet/planet';
import { nextRandom } from '../utils/stochasticRound';

const LOAN_LIMIT = 1000;

function nextLoanId(): string {
    const hex = (n: number) => ((n * 0x100000000) >>> 0).toString(16).padStart(8, '0');
    return `${hex(nextRandom())}-${hex(nextRandom())}-${hex(nextRandom())}-${hex(nextRandom())}`;
}

export const LOAN_TYPES = [
    'starter',
    'discretionary',
    'wageCoverage',
    'rollover',
    'bufferCoverage',
    'claimCoverage',
    'shipPenaltyCoverage',
    'licenseBootstrap',
    'forexWorkingCapital',
    'shipbuilderBootstrap',
    'consolidated',
] as const;

export type LoanType = (typeof LOAN_TYPES)[number];

export type Loan = {
    id: string;
    type: LoanType;
    principal: number;
    remainingPrincipal: number;
    annualInterestRate: number;
    takenAtTick: number;
    maturityTick: number;
    earlyRepaymentAllowed: boolean;
};

export const LOAN_TERM_TICKS: Record<LoanType, number> = {
    starter: TICKS_PER_YEAR * 10,
    discretionary: TICKS_PER_YEAR,
    wageCoverage: TICKS_PER_YEAR,
    rollover: TICKS_PER_YEAR,
    bufferCoverage: TICKS_PER_YEAR,
    claimCoverage: TICKS_PER_YEAR,
    shipPenaltyCoverage: TICKS_PER_YEAR,
    licenseBootstrap: TICKS_PER_YEAR,
    forexWorkingCapital: TICKS_PER_YEAR * 1000,
    shipbuilderBootstrap: TICKS_PER_YEAR * 1000,
    consolidated: TICKS_PER_YEAR,
} as const;

const LOAN_EARLY_REPAYMENT: Record<LoanType, boolean> = {
    starter: true,
    discretionary: true,
    rollover: false,
    wageCoverage: false,
    bufferCoverage: false,
    claimCoverage: false,
    shipPenaltyCoverage: false,
    licenseBootstrap: false,
    forexWorkingCapital: false,
    shipbuilderBootstrap: false,
    consolidated: false,
};

export function makeLoan(
    type: LoanType,
    principal: number,
    annualInterestRate: number,
    takenAtTick: number,
    maturityTick: number,
    earlyRepaymentAllowed: boolean,
): Loan {
    return {
        id: nextLoanId(),
        type,
        principal,
        remainingPrincipal: principal,
        annualInterestRate,
        takenAtTick,
        maturityTick,
        earlyRepaymentAllowed,
    };
}

export function consolidateLoans(assets: AgentPlanetAssets, bank: Bank, tick: number): Loan | null {
    if (assets.activeLoans.length <= 1) {
        return null;
    }

    const totalPrincipal = assets.activeLoans.reduce((sum, l) => sum + l.remainingPrincipal, 0);
    if (totalPrincipal <= 0) {
        return null;
    }

    // Weighted average interest rate
    const weightedRate =
        assets.activeLoans.reduce((sum, l) => sum + l.annualInterestRate * l.remainingPrincipal, 0) / totalPrincipal;

    // Weighted average maturity (only for loans with maturityTick > 0)
    const loansWithMaturity = assets.activeLoans.filter((l) => l.maturityTick > 0);
    const avgMaturity =
        loansWithMaturity.length > 0
            ? Math.round(
                  loansWithMaturity.reduce((sum, l) => sum + l.maturityTick * l.remainingPrincipal, 0) /
                      loansWithMaturity.reduce((sum, l) => sum + l.remainingPrincipal, 0),
              )
            : 0;

    const consolidated = makeLoan('consolidated', totalPrincipal, weightedRate, tick, avgMaturity, true);

    // Replace all existing loans with the consolidated one — bank totals unchanged
    assets.activeLoans = [consolidated];

    return consolidated;
}

export function grantLoan(
    assets: AgentPlanetAssets,
    bank: Bank,
    amount: number,
    purpose: LoanType,
    tick: number,
): Loan {
    if (assets.activeLoans.length >= LOAN_LIMIT) {
        consolidateLoans(assets, bank, tick);
    }
    const maturityTick = LOAN_TERM_TICKS[purpose] > 0 ? tick + LOAN_TERM_TICKS[purpose] : 0;
    const earlyRepaymentAllowed = LOAN_EARLY_REPAYMENT[purpose];

    const loan = makeLoan(purpose, amount, bank.loanRate * TICKS_PER_YEAR, tick, maturityTick, earlyRepaymentAllowed);

    assets.deposits += amount;
    assets.activeLoans.push(loan);
    bank.loans += amount;
    bank.deposits += amount;
    bank.equity = bank.deposits - bank.loans;

    return loan;
}

export function totalOutstandingLoans(loans: Loan[]): number {
    return loans.reduce((sum, l) => sum + l.remainingPrincipal, 0);
}

export function repayLoansOldestFirst(activeLoans: Loan[], maxRepayment: number): number {
    let remaining = maxRepayment;
    let totalRepaid = 0;

    activeLoans.sort((a, b) => a.takenAtTick - b.takenAtTick);

    let i = 0;
    while (i < activeLoans.length && remaining > 0) {
        const loan = activeLoans[i]!;
        const repayAmount = Math.min(loan.remainingPrincipal, remaining);
        loan.remainingPrincipal -= repayAmount;
        remaining -= repayAmount;
        totalRepaid += repayAmount;
        if (loan.remainingPrincipal <= 0) {
            activeLoans.splice(i, 1);
        } else {
            i++;
        }
    }

    return totalRepaid;
}
