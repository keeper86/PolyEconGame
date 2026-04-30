import type { GameState } from '../planet/planet';
import type { OutboundMessage, PendingAction } from './messages';
import { computeLoanConditions } from '../financial/loanConditions';
import { makeLoan } from '../financial/loanTypes';
import { TICKS_PER_YEAR } from '../constants';

/**
 * Handle 'requestLoan' action
 */
export function handleRequestLoan(
    state: GameState,
    action: Extract<PendingAction, { type: 'requestLoan' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, amount } = action;
    const agent = state.agents.get(agentId);
    const planet = state.planets.get(planetId);
    if (!agent || !planet) {
        safePostMessage({
            type: 'loanDenied',
            requestId,
            reason: 'Agent or planet not found',
        });
        return;
    }
    const conditions = computeLoanConditions(agent, planet, state.tick);
    if (amount <= 0 || amount > conditions.maxLoanAmount * 1.1) {
        safePostMessage({
            type: 'loanDenied',
            requestId,
            reason: `Requested amount ${amount} exceeds approved limit ${conditions.maxLoanAmount}`,
        });
        return;
    }

    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'loanDenied',
            requestId,
            reason: `Agent '${agentId}' has no asset record for planet '${planetId}'`,
        });
        return;
    }
    assets.deposits += amount;
    assets.activeLoans.push(
        makeLoan(
            conditions.isNewAgent ? 'starter' : 'discretionary',
            amount,
            conditions.annualInterestRate,
            state.tick,
            state.tick + TICKS_PER_YEAR,
            true,
        ),
    );
    planet.bank.loans += amount;
    planet.bank.deposits += amount;
    planet.bank.equity = planet.bank.deposits - planet.bank.loans;
    if (conditions.isNewAgent) {
        agent.starterLoanTaken = true;
    }
    console.log(`[worker] Loan of ${amount} granted to agent '${agentId}' on planet '${planetId}'`);
    safePostMessage({ type: 'loanGranted', requestId, agentId, amount });
}

/**
 * Handle 'repayLoan' action — explicit per-loan repayment initiated by a player.
 */
export function handleRepayLoan(
    state: GameState,
    action: Extract<PendingAction, { type: 'repayLoan' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, loanId, fraction } = action;
    const agent = state.agents.get(agentId);
    const planet = state.planets.get(planetId);
    if (!agent || !planet) {
        safePostMessage({ type: 'repayDenied', requestId, reason: 'Agent or planet not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({ type: 'repayDenied', requestId, reason: `Agent has no asset record for planet '${planetId}'` });
        return;
    }
    const loan = assets.activeLoans.find((l) => l.id === loanId);
    if (!loan) {
        safePostMessage({ type: 'repayDenied', requestId, reason: `Loan '${loanId}' not found` });
        return;
    }
    if (!loan.earlyRepaymentAllowed) {
        safePostMessage({ type: 'repayDenied', requestId, reason: `Early repayment is not allowed for this loan` });
        return;
    }
    const amount = Math.floor(loan.remainingPrincipal * fraction);
    if (amount <= 0) {
        safePostMessage({ type: 'repayDenied', requestId, reason: 'Repayment amount is zero' });
        return;
    }
    if (assets.deposits < amount) {
        safePostMessage({
            type: 'repayDenied',
            requestId,
            reason: `Insufficient deposits (have ${assets.deposits}, need ${amount})`,
        });
        return;
    }

    // Apply repayment directly to the loan
    const actualRepayment = Math.min(loan.remainingPrincipal, amount);
    loan.remainingPrincipal -= actualRepayment;
    if (loan.remainingPrincipal <= 0) {
        assets.activeLoans = assets.activeLoans.filter((l) => l.id !== loanId);
    }

    assets.deposits -= actualRepayment;
    planet.bank.loans -= actualRepayment;
    planet.bank.deposits -= actualRepayment;
    planet.bank.equity = planet.bank.deposits - planet.bank.loans;

    console.log(`[worker] Loan '${loanId}' repaid ${actualRepayment} by agent '${agentId}' on planet '${planetId}'`);
    safePostMessage({ type: 'loanRepaid', requestId, agentId, loanId, amount: actualRepayment });
}

/**
 * Dispatch financial-related actions to the appropriate handler
 */
export function handleFinancialAction(
    state: GameState,
    action: PendingAction,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    switch (action.type) {
        case 'requestLoan':
            handleRequestLoan(state, action, safePostMessage);
            break;
        case 'repayLoan':
            handleRepayLoan(state, action, safePostMessage);
            break;
        default:
            // This function only handles financial actions
            break;
    }
}
