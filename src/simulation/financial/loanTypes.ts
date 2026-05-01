import { nextRandom } from '../utils/stochasticRound';

/** Generate a deterministic loan ID from the seeded PRNG. */
function nextLoanId(): string {
    const hex = (n: number) => ((n * 0x100000000) >>> 0).toString(16).padStart(8, '0');
    return `${hex(nextRandom())}-${hex(nextRandom())}-${hex(nextRandom())}-${hex(nextRandom())}`;
}

/**
 * Describes the originating context of a loan.
 *
 * - starter / discretionary : explicitly requested by a player / controller via the UI
 * - wageCoverage             : automatic emergency loan issued to cover a wage-bill shortfall
 * - bufferCoverage           : automatic emergency loan issued to cover an input-buffer shortfall
 * - claimCoverage            : automatic emergency loan issued to cover a resource-claim billing shortfall
 * - shipPenaltyCoverage      : automatic emergency loan issued to cover a contract-penalty shortfall
 * - licenseBootstrap         : loan issued automatically when a new agent obtains its first planet license
 * - forexWorkingCapital      : working-capital loan issued to a forex market-maker agent
 */
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
    /** Unique stable identifier used for targeted repayment via the UI. */
    id: string;
    type: LoanType;
    /** Original principal at the time of origination. */
    principal: number;
    /** Amount still outstanding (decremented when repayment is made). */
    remainingPrincipal: number;
    /** Annual interest rate, snapshotted at origination (0–1 scale, e.g. 0.05 = 5 %). */
    annualInterestRate: number;
    /** Simulation tick at which the loan was taken. */
    takenAtTick: number;
    /** Simulation tick at which the loan matures; 0 if no fixed maturity. */
    maturityTick: number;
    /**
     * Whether the borrower is allowed to repay this loan ahead of maturity via
     * the UI. Set to false for internally-managed system loans.
     */
    earlyRepaymentAllowed: boolean;
};

/**
 * Sum of all outstanding principal across a list of loans.
 * Equivalent to the legacy scalar `assets.loans`.
 */
export function totalOutstandingLoans(loans: Loan[]): number {
    return loans.reduce((sum, l) => sum + l.remainingPrincipal, 0);
}

/**
 * Convenience factory used by loan-creation sites to avoid boilerplate.
 *
 * @param type                   Loan type / originating context.
 * @param principal              Loan amount.
 * @param annualInterestRate     Annual interest rate at origination.
 * @param takenAtTick            Current simulation tick.
 * @param maturityTick           Tick at which the loan matures.
 * @param earlyRepaymentAllowed  Whether early UI repayment is permitted.
 */
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

/**
 * Repay a given amount from `activeLoans` in order from oldest to newest
 * (FIFO).  Loans are removed from the array once fully repaid.
 *
 * @param activeLoans  The agent's live loan list (mutated in-place).
 * @param maxRepayment Maximum currency units available for repayment.
 * @returns The total amount actually repaid (≤ maxRepayment).
 */
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
