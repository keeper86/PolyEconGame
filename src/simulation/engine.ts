import { isMonthBoundary, isYearBoundary } from './constants';
import type { GameState } from './planet/planet';
import { environmentTick } from './planet/environment';
import { productionTick } from './planet/production';
import { updateAllocatedWorkers } from './workforce/allocatedWorkers';
import { preProductionLaborMarketTick } from './workforce/laborMarketTick';
import { postProductionLaborMarketTick } from './workforce/laborMarketMonthTick';
import { laborMarketYearTick } from './workforce/laborMarketYearTick';
import { populationAdvanceYearTick, populationTick } from './population/populationTick';
import { seedRng } from './utils/stochasticRound';
import { preProductionFinancialTick, postProductionFinancialTick } from './financial/financialTick';
import { updateAgentPricing } from './market/agentPricing';
import { foodMarketTick } from './market/foodMarket';
import { intergenerationalTransfersTick } from './market/intergenerationalTransfers';

export { seedRng };

// internalTickCounter has been removed; gameState.tick (incremented by the
// caller before advanceTick is called) is used for all boundary checks.
export function advanceTick(gameState: GameState) {
    // 1. Environment tick
    environmentTick(gameState);

    // 2. Workforce allocation update
    updateAllocatedWorkers(gameState.agents, gameState.planets);

    // 3. Labor market tick (monthly: hiring, firing, voluntary quits)
    if (isMonthBoundary(gameState.tick)) {
        preProductionLaborMarketTick(gameState.agents, gameState.planets);
    }

    // 4. Pre-production financial tick: wages, working-capital loans
    preProductionFinancialTick(gameState);

    // 5. Population tick: nutrition, mortality, disability, fertility
    populationTick(gameState);

    // 6. Production tick: facility output
    productionTick(gameState);

    // 7. Agent pricing: each food producer sets its offer price & quantity
    updateAgentPricing(gameState);

    // 8. Intergenerational transfers: family support flows
    //    Runs BEFORE the food market so that dependent cohorts (children,
    //    elderly) receive wealth they can spend on food in the same tick.
    intergenerationalTransfersTick(gameState);

    // 9. Food market clearing: demand, per-agent merit-order dispatch, settlement
    foodMarketTick(gameState);

    // 11. Post-production financial tick: loan repayment, reconciliation
    postProductionFinancialTick(gameState);

    // Month/year boundary updates
    if (isMonthBoundary(gameState.tick)) {
        postProductionLaborMarketTick(gameState.agents, gameState.planets);
    }

    if (isYearBoundary(gameState.tick)) {
        populationAdvanceYearTick(gameState);
        laborMarketYearTick(gameState.agents);
    }
}
