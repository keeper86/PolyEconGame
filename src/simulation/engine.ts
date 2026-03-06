import { isMonthBoundary, isYearBoundary } from './constants';
import type { GameState } from './planet';
import { checkPopulationWorkforceConsistency } from './invariants';
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

process.env.SIM_DEBUG = '1';

function debugCheck(stepName: string, gs: GameState): void {
    if (process.env.SIM_DEBUG !== '1') {
        return;
    }
    const d = checkPopulationWorkforceConsistency(gs.agents, gs.planets);
    if (d.length) {
        throw new Error(`tick ${gs.tick} after ${stepName}: ${d.join('; ')}`);
    }
}

// internalTickCounter has been removed; gameState.tick (incremented by the
// caller before advanceTick is called) is used for all boundary checks.
export function advanceTick(gameState: GameState) {
    // 1. Environment tick
    environmentTick(gameState);
    debugCheck('environmentTick', gameState);

    // 2. Workforce allocation update
    updateAllocatedWorkers(gameState.agents, gameState.planets);
    debugCheck('updateAllocatedWorkers', gameState);

    // 3. Labor market tick
    laborMarketTick(gameState.agents, gameState.planets);
    debugCheck('laborMarketTick', gameState);

    // 4. Pre-production financial tick: wages, working-capital loans
    preProductionFinancialTick(gameState);
    debugCheck('preProductionFinancialTick', gameState);

    // 5. Population tick: nutrition, mortality, disability, fertility
    populationTick(gameState);
    debugCheck('populationTick', gameState);

    // 6. Production tick: facility output
    productionTick(gameState);
    debugCheck('productionTick', gameState);

    // 7. Agent pricing: each food producer sets its offer price & quantity
    updateAgentPricing(gameState);
    debugCheck('updateAgentPricing', gameState);

    // 8. Food market clearing: demand, per-agent merit-order dispatch, settlement
    foodMarketTick(gameState);
    debugCheck('foodMarketTick', gameState);

    // 9. Intergenerational transfers: family support flows
    intergenerationalTransfersTick(gameState);
    debugCheck('intergenerationalTransfersTick', gameState);

    // 10. Wealth diffusion: low-temperature variance smoothing
    wealthDiffusionTick(gameState);
    debugCheck('wealthDiffusionTick', gameState);

    // 11. Post-production financial tick: loan repayment, reconciliation
    postProductionFinancialTick(gameState);
    debugCheck('postProductionFinancialTick', gameState);

    // Month/year boundary updates
    if (isMonthBoundary(gameState.tick)) {
        laborMarketMonthTick(gameState.agents, gameState.planets);
        debugCheck('laborMarketMonthTick', gameState);
    }

    if (isYearBoundary(gameState.tick)) {
        populationAdvanceYearTick(gameState);
        debugCheck('populationBoundaryTick', gameState);
        laborMarketYearTick(gameState.agents);
        debugCheck('laborMarketYearTick', gameState);
    }

    // Final check
    debugCheck('final', gameState);
}
