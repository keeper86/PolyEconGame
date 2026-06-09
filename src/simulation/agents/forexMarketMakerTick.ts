import { FOREX_MM_RETAIN_RATIO, FOREX_MM_TARGET_DEPOSIT } from '../constants';
import { grantLoan, repayLoansOldestFirst, totalOutstandingLoans } from '../financial/loanTypes';
import type { GameState } from '../planet/planet';
import type { Loan } from '../financial/loanTypes';
import { ROLLOVER_FEE_RATE } from '../financial/financialTick';

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
                const fee = Math.round(shortfall * ROLLOVER_FEE_RATE);
                const rolloverPrincipal = shortfall + fee;

                grantLoan(assets, planet.bank, rolloverPrincipal, 'forexWorkingCapital', gameState.tick);

                assets.deposits -= shortfall;
                planet.bank.loans -= shortfall;
                planet.bank.deposits -= shortfall;

                const rolloverLoan = assets.activeLoans.pop()!;
                remainingLoans.push(rolloverLoan);
            }

            assets.activeLoans = remainingLoans;
            planet.bank.equity = planet.bank.deposits - planet.bank.loans;
        }
    }
}

export function forexMMRepaymentTick(gameState: GameState): void {
    enforceForexMMLoanMaturities(gameState);

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
