import type { GameState } from '../planet/planet';
import type { OutboundMessage, PendingAction } from './messages';
import { computeLoanConditions } from '../financial/loanConditions';

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
    // Re-check credit conditions at application time to guard
    // against race conditions (e.g. conditions changed between
    // getLoanConditions query and the actual request).
    const conditions = computeLoanConditions(agent, planet);
    if (amount <= 0 || amount > conditions.maxLoanAmount) {
        safePostMessage({
            type: 'loanDenied',
            requestId,
            reason: `Requested amount ${amount} exceeds approved limit ${conditions.maxLoanAmount}`,
        });
        return;
    }
    // TODO: unify with automatic loan for wages and move to wealthOps
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
    assets.loans += amount;
    planet.bank.loans += amount;
    planet.bank.deposits += amount;
    planet.bank.equity = planet.bank.deposits - planet.bank.loans;
    console.log(`[worker] Loan of ${amount} granted to agent '${agentId}' on planet '${planetId}'`);
    safePostMessage({ type: 'loanGranted', requestId, agentId, amount });
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
        default:
            // This function only handles financial actions
            break;
    }
}
