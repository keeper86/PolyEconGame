import { isMonthBoundary, isYearBoundary } from './constants';
import type { GameState } from './planet';
import { checkPopulationWorkforceConsistency, checkAgeMomentConsistency } from './invariants';
import { environmentTick } from './environment';
import { populationTick, populationAdvanceYear } from './population';
import { productionTick } from './production';
import { updateAllocatedWorkers } from './workforce/allocatedWorkers';
import { laborMarketTick } from './workforce/laborMarketTick';
import { laborMarketMonthTick } from './workforce/laborMarketMonthTick';
import { laborMarketYearTick } from './workforce/laborMarketYearTick';
import { populationAdvanceYearTick } from './population/populationTick';
import { seedRng } from './utils/stochasticRound';
import { preProductionFinancialTick, postProductionFinancialTick } from './financial/financialTick';
import { updateAgentPricing, foodMarketTick, intergenerationalTransfersTick, wealthDiffusionTick } from './market';

export type { GameState };
export { populationTick, populationAdvanceYear, environmentTick, productionTick };
export { seedRng };

/**
 * Run all invariant checks for the current game state.
 * Returns an array of discrepancy messages (empty = healthy).
 *
 * Exposed for use in test-only or debug-mode validation.
 */
export function runInvariantChecks(gs: GameState): string[] {
    return [
        ...checkPopulationWorkforceConsistency(gs.agents, gs.planets),
        ...checkAgeMomentConsistency(gs.agents, gs.planets),
    ];
}

/**
 * End-of-tick debug check: when SIM_DEBUG=1 is set, runs all invariant
 * checks once at the end of the tick and logs any discrepancies.
 * Does NOT call process.exit — callers decide how to handle failures.
 */
function debugCheckEndOfTick(gs: GameState): void {
    if (process.env.SIM_DEBUG !== '1') {
        return;
    }
    const d = runInvariantChecks(gs);
    if (d.length) {
        console.error(`[SIM_DEBUG] tick ${gs.tick} invariant failures:\n  ${d.join('\n  ')}`);
    }
}

// internalTickCounter has been removed; gameState.tick (incremented by the
// caller before advanceTick is called) is used for all boundary checks.
export function advanceTick(gameState: GameState) {
    // 1. Environment tick
    environmentTick(gameState);

    // 2. Workforce allocation update
    updateAllocatedWorkers(gameState.agents, gameState.planets);

    // 3. Labor market tick
    laborMarketTick(gameState.agents, gameState.planets);

    // 4. Pre-production financial tick: wages, working-capital loans
    preProductionFinancialTick(gameState);

    // 5. Population tick: nutrition, mortality, disability, fertility
    populationTick(gameState);

    // 6. Production tick: facility output
    productionTick(gameState);

    // 7. Agent pricing: each food producer sets its offer price & quantity
    updateAgentPricing(gameState);

    // 8. Food market clearing: demand, per-agent merit-order dispatch, settlement
    foodMarketTick(gameState);

    // 9. Intergenerational transfers: family support flows
    intergenerationalTransfersTick(gameState);

    // 10. Wealth diffusion: low-temperature variance smoothing
    wealthDiffusionTick(gameState);

    // 11. Post-production financial tick: loan repayment, reconciliation
    postProductionFinancialTick(gameState);

    // Month/year boundary updates
    if (isMonthBoundary(gameState.tick)) {
        laborMarketMonthTick(gameState.agents, gameState.planets);
    }

    if (isYearBoundary(gameState.tick)) {
        populationAdvanceYearTick(gameState);
        laborMarketYearTick(gameState.agents);
    }

    // Single end-of-tick invariant check (SIM_DEBUG=1 only)
    debugCheckEndOfTick(gameState);
}
