import type { GameState } from '../planet/planet';
import type { OutboundMessage, PendingAction } from './messages';
import { computeLoanConditions } from '../financial/loanConditions';
import { grantLoan } from '../financial/loanTypes';

function handleRequestLoan(
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
            error: { code: 'agentOrPlanetNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    const conditions = computeLoanConditions(agent, planet, state.shipCapitalMarket);
    if (amount <= 0 || amount > conditions.maxLoanAmount * 1.1) {
        safePostMessage({
            type: 'loanDenied',
            requestId,
            error: { code: 'loanAmountExceedsLimit', params: { amount: amount, limit: conditions.maxLoanAmount } },
            processedAtTick: state.tick,
        });
        return;
    }

    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'loanDenied',
            requestId,
            error: { code: 'agentAssetRecordMissing', params: { agentId: agentId, planetId: planetId } },
            processedAtTick: state.tick,
        });
        return;
    }
    grantLoan(assets, planet.bank, amount, conditions.isNewAgent ? 'starter' : 'discretionary', state.tick);
    if (conditions.isNewAgent) {
        agent.starterLoanTaken = true;
    }
    console.log(`[worker] Loan of ${amount} granted to agent '${agentId}' on planet '${planetId}'`);
    safePostMessage({ type: 'loanGranted', requestId, agentId, amount, processedAtTick: state.tick });
}

function handleRepayLoan(
    state: GameState,
    action: Extract<PendingAction, { type: 'repayLoan' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, loanId, fraction } = action;
    const agent = state.agents.get(agentId);
    const planet = state.planets.get(planetId);
    if (!agent || !planet) {
        safePostMessage({
            type: 'repayDenied',
            requestId,
            error: { code: 'agentOrPlanetNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'repayDenied',
            requestId,
            error: { code: 'agentAssetRecordMissingForPlanet', params: { planetId: planetId } },
            processedAtTick: state.tick,
        });
        return;
    }
    const loan = assets.activeLoans.find((l) => l.id === loanId);
    if (!loan) {
        safePostMessage({
            type: 'repayDenied',
            requestId,
            error: { code: 'loanNotFound', params: { loanId: loanId } },
            processedAtTick: state.tick,
        });
        return;
    }
    if (!loan.earlyRepaymentAllowed) {
        safePostMessage({
            type: 'repayDenied',
            requestId,
            error: { code: 'earlyRepaymentNotAllowed', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    const amount = Math.floor(loan.remainingPrincipal * fraction);
    if (amount <= 0) {
        safePostMessage({
            type: 'repayDenied',
            requestId,
            error: { code: 'repaymentAmountZero', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    if (assets.deposits < amount) {
        safePostMessage({
            type: 'repayDenied',
            requestId,
            error: { code: 'insufficientDeposits', params: { available: assets.deposits, required: amount } },
            processedAtTick: state.tick,
        });
        return;
    }

    const actualRepayment = Math.min(loan.remainingPrincipal, amount);
    loan.remainingPrincipal -= actualRepayment;
    if (loan.remainingPrincipal <= 0) {
        assets.activeLoans = assets.activeLoans.filter((l) => l.id !== loanId);
    }

    assets.deposits -= actualRepayment;
    planet.bank.loans -= actualRepayment;
    planet.bank.deposits -= actualRepayment;

    console.log(`[worker] Loan '${loanId}' repaid ${actualRepayment} by agent '${agentId}' on planet '${planetId}'`);
    safePostMessage({
        type: 'loanRepaid',
        requestId,
        agentId,
        loanId,
        amount: actualRepayment,
        processedAtTick: state.tick,
    });
}

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
            break;
    }
}
