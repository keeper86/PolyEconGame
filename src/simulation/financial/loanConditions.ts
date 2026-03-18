/**
 * financial/loanConditions.ts
 *
 * Credit-condition evaluation for voluntary (player-initiated) bank loans.
 *
 * The bank issues *working-capital* loans automatically inside
 * `preProductionFinancialTick` to cover wage shortfalls.  This module
 * handles a *separate* credit product: discretionary loans that the
 * player can request from the "Borrow" UI panel.
 *
 * Credit limit formula
 * --------------------
 * 1. **Starter loan** – any agent with no outstanding discretionary loans
 *    and no prior market revenue gets `STARTER_LOAN_AMOUNT`.
 * 2. **Established agent** – the limit is
 *       max(0,  LOAN_CASH_FLOW_MONTHS × monthlyNetCashFlow  −  existingDiscretionaryLoans)
 *    where
 *       monthlyNetCashFlow = monthlyRevenue − monthlyWageBill
 *       monthlyRevenue     = Σ lastRevenue for all market sell positions   × LOAN_TICKS_PER_MONTH
 *       monthlyWageBill    = lastWageBill × LOAN_TICKS_PER_MONTH
 *
 * If the net cash flow is ≤ 0 the limit drops to 0, effectively blocking
 * further loans until the business turns profitable.
 */

import { STARTER_LOAN_AMOUNT, LOAN_CASH_FLOW_MONTHS, LOAN_TICKS_PER_MONTH } from '../constants';
import type { Agent, Planet } from '../planet/planet';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LoanConditions = {
    /** Maximum additional amount the agent may borrow right now. */
    maxLoanAmount: number;
    /** Annual interest rate (matches planet.bank.loanRate, expressed as a
     *  per-tick rate but shown to the player annualised). */
    annualInterestRate: number;
    /** Outstanding discretionary loan balance already held by this agent. */
    existingDiscretionaryLoans: number;
    /** Monthly wage cost used in the projection (informational). */
    monthlyWageBill: number;
    /** Monthly market revenue used in the projection (informational). */
    monthlyRevenue: number;
    /** Net monthly cash flow = monthlyRevenue − monthlyWageBill. */
    monthlyNetCashFlow: number;
    /** Whether this agent qualifies as a "new" agent (starter-loan path). */
    isNewAgent: boolean;
};

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------

/**
 * Compute the credit conditions the planet's bank would offer `agent` on
 * `planet` right now.
 *
 * Only the *discretionary* loan balance (stored in `assets.loans`) is
 * considered for limit purposes; the automatic working-capital loans that
 * cover wage shortfalls are the same field, so the formula naturally sees a
 * high existing balance when the agent already has debt.
 */
export function computeLoanConditions(agent: Agent, planet: Planet): LoanConditions {
    const assets = agent.assets[planet.id];
    const bank = planet.bank;

    // Per-tick rate → approximate annualised rate (simple, not compounded)
    const ticksPerYear = 360; // TICKS_PER_YEAR
    const annualInterestRate = bank.loanRate * ticksPerYear;

    const existingLoans = assets?.loans ?? 0;

    // Monthly cash-flow projection
    const lastWageBill = assets?.lastWageBill ?? 0;
    const monthlyWageBill = lastWageBill * LOAN_TICKS_PER_MONTH;

    // Sum all sell-side revenues from last market tick
    let tickRevenue = 0;
    if (assets?.market?.sell) {
        for (const offer of Object.values(assets.market.sell)) {
            tickRevenue += offer?.lastRevenue ?? 0;
        }
    }
    const monthlyRevenue = tickRevenue * LOAN_TICKS_PER_MONTH;

    const monthlyNetCashFlow = monthlyRevenue - monthlyWageBill;

    // Determine whether this is a "new" agent (no revenue history and no
    // prior discretionary loans).
    const isNewAgent = tickRevenue === 0 && existingLoans === 0;

    let maxLoanAmount: number;
    if (isNewAgent) {
        maxLoanAmount = STARTER_LOAN_AMOUNT;
    } else if (monthlyNetCashFlow <= 0) {
        // Already cash-flow negative or zero — no further lending.
        maxLoanAmount = 0;
    } else {
        const projectedCapacity = LOAN_CASH_FLOW_MONTHS * monthlyNetCashFlow;
        maxLoanAmount = Math.max(0, projectedCapacity - existingLoans);
    }

    return {
        maxLoanAmount: Math.floor(maxLoanAmount), // round down to whole currency units
        annualInterestRate,
        existingDiscretionaryLoans: existingLoans,
        monthlyWageBill,
        monthlyRevenue,
        monthlyNetCashFlow,
        isNewAgent,
    };
}
