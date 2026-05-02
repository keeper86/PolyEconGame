import { TICKS_PER_YEAR } from '../constants';
import type { Bank } from '../planet/planet';
import type { AgentPlanetAssets } from '../planet/planet';
import { nextRandom } from '../utils/stochasticRound';

const LOAN_LIMIT = 1000;

/** Generate a deterministic loan ID from the seeded PRNG. */
function nextLoanId(): string {
    const hex = (n: number) => ((n * 0x100000000) >>> 0).toString(16).padStart(8, '0');
    return `${hex(nextRandom())}-${hex(nextRandom())}-${hex(nextRandom())}-${hex(nextRandom())}`;
}

export type LoanType =
    | 'starter'
    | 'discretionary'
    | 'wageCoverage'
    | 'bufferCoverage'
    | 'claimCoverage'
    | 'shipPenaltyCoverage'
    | 'licenseBootstrap'
    | 'forexWorkingCapital';

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

const LOAN_TERM_TICKS: Record<LoanType, number> = {
    starter: TICKS_PER_YEAR * 10,
    discretionary: TICKS_PER_YEAR,
    wageCoverage: TICKS_PER_YEAR,
    bufferCoverage: TICKS_PER_YEAR,
    claimCoverage: TICKS_PER_YEAR,
    shipPenaltyCoverage: TICKS_PER_YEAR,
    licenseBootstrap: TICKS_PER_YEAR,
    forexWorkingCapital: TICKS_PER_YEAR * 1000, // effectively no maturity
};

/** Whether early (UI-initiated) repayment is allowed for this loan type. */
const LOAN_EARLY_REPAYMENT: Record<LoanType, boolean> = {
    starter: true,
    discretionary: true,
    wageCoverage: false,
    bufferCoverage: false,
    claimCoverage: false,
    shipPenaltyCoverage: false,
    licenseBootstrap: false,
    forexWorkingCapital: false,
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

export function grantLoan(
    assets: AgentPlanetAssets,
    bank: Bank,
    amount: number,
    purpose: LoanType,
    tick: number,
): Loan {
    if (assets.activeLoans.length >= LOAN_LIMIT) {
        throw new Error(
            `Loan limit exceeded: cannot have more than ${LOAN_LIMIT} active loans
                (currently has ${assets.activeLoans.length}): ${assets.activeLoans.map((l) => l.type).join(', ')}`,
        );
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

    // Sort oldest-first so FIFO ordering is preserved
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
            // do not increment i — next loan is now at index i
        } else {
            i++;
        }
    }

    return totalRepaid;
}
