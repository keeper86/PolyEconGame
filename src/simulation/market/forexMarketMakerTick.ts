import { FOREX_MM_RETAIN_RATIO, FOREX_MM_TARGET_DEPOSIT } from '../constants';
import { grantLoan, repayLoansOldestFirst, totalOutstandingLoans } from '../financial/loanTypes';
import type { GameState } from '../planet/planet';
import type { Loan } from '../financial/loanTypes';

/**
 * Enforce loan maturities for forex market-makers.
 *
 * Any loan whose maturityTick has been reached must be repaid immediately.
 * If the MM lacks sufficient deposits, the shortfall is covered by a new
 * rollover loan (with a fresh maturity).
 */
function enforceForexMMLoanMaturities(gameState: GameState): void {
    for (const mm of gameState.forexMarketMakers.values()) {
        for (const [planetId, assets] of Object.entries(mm.assets)) {
            const planet = gameState.planets.get(planetId);
            if (!planet) {
                continue;
            }

            const maturedLoans: Loan[] = [];
            const remainingLoans: Loan[] = [];

            for (const loan of assets.activeLoans) {
                if (loan.maturityTick > 0 && gameState.tick >= loan.maturityTick) {
                    maturedLoans.push(loan);
                } else {
                    remainingLoans.push(loan);
                }
            }

            if (maturedLoans.length === 0) {
                continue;
            }

            const totalDue = maturedLoans.reduce((sum, l) => sum + l.remainingPrincipal, 0);
            const canRepay = Math.min(totalDue, assets.deposits);
            const shortfall = totalDue - canRepay;

            if (canRepay > 0) {
                assets.deposits -= canRepay;
                planet.bank.loans -= canRepay;
                planet.bank.deposits -= canRepay;
            }

            if (shortfall > 0) {
                grantLoan(assets, planet.bank, shortfall, 'forexWorkingCapital', gameState.tick);
                // The rollover loan was pushed onto assets.activeLoans by grantLoan,
                // but we need to keep it in remainingLoans instead. Move it over.
                const rolloverLoan = assets.activeLoans.pop()!;
                remainingLoans.push(rolloverLoan);
            }

            assets.activeLoans = remainingLoans;
            planet.bank.equity = planet.bank.deposits - planet.bank.loans;
        }
    }
}

/**
 * Repayment tick for forex market-maker loans.
 *
 * Runs after forexTick() each tick.  For each MM and each planet where it
 * holds a loan, any deposits above the retention threshold are used to repay
 * the loan symmetrically (both bank.loans and bank.deposits shrink together,
 * preserving the monetary-conservation invariant).
 */
export function forexMMRepaymentTick(gameState: GameState): void {
    // First enforce maturities
    enforceForexMMLoanMaturities(gameState);

    // Then do voluntary repayment from excess deposits
    for (const mm of gameState.forexMarketMakers.values()) {
        for (const [planetId, assets] of Object.entries(mm.assets)) {
            const agentLoanTotal = totalOutstandingLoans(assets.activeLoans);
            if (agentLoanTotal <= 0) {
                continue;
            }
            const planet = gameState.planets.get(planetId);
            if (!planet) {
                continue;
            }
            const retainThreshold = FOREX_MM_TARGET_DEPOSIT * FOREX_MM_RETAIN_RATIO;
            const excess = Math.max(0, assets.deposits - retainThreshold);
            const repayment = Math.min(agentLoanTotal, excess);
            if (repayment <= 0) {
                continue;
            }
            const actualRepayment = repayLoansOldestFirst(assets.activeLoans, repayment);
            assets.deposits -= actualRepayment;
            planet.bank.loans -= actualRepayment;
            planet.bank.deposits -= actualRepayment;
            planet.bank.equity = planet.bank.deposits - planet.bank.loans;
        }
    }
}
