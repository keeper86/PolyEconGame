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
    environmentTick(gameState);
    debugCheck('environmentTick', gameState);

    updateAllocatedWorkers(gameState.agents, gameState.planets);
    debugCheck('updateAllocatedWorkers', gameState);

    laborMarketTick(gameState.agents, gameState.planets);
    debugCheck('laborMarketTick', gameState);

    // Pre-production financial tick: wages, working-capital loans.
    preProductionFinancialTick(gameState);
    debugCheck('preProductionFinancialTick', gameState);

    populationTick(gameState);
    debugCheck('populationTick', gameState);

    productionTick(gameState);
    debugCheck('productionTick', gameState);

    // Post-production financial tick: consumption, revenue, loan repayment.
    postProductionFinancialTick(gameState);
    debugCheck('postProductionFinancialTick', gameState);

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
