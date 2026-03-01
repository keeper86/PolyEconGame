import { isMonthBoundary, isYearBoundary } from './constants';
import { laborMarketMonthTick, laborMarketTick, laborMarketYearTick, updateAllocatedWorkers } from './workforce';
import type { GameState } from './planet';
import { checkPopulationWorkforceConsistency } from './invariants';
import { environmentTick } from './environment';
import { populationTick, populationAdvanceYearTick, populationAdvanceYear } from './population';
import { productionTick } from './production';

export type { GameState };
export { populationTick, populationAdvanceYearTick, populationAdvanceYear, environmentTick, productionTick };

process.env.SIM_DEBUG = '1';

// internalTickCounter has been removed; gameState.tick (incremented by the
// caller before advanceTick is called) is used for all boundary checks.
export function advanceTick(gameState: GameState) {
    environmentTick(gameState);
    if (process.env.SIM_DEBUG === '1') {
        const d = checkPopulationWorkforceConsistency(gameState.agents, gameState.planets);
        if (d.length) {
            throw new Error(`after environmentTick: ${d.join('; ')}`);
        }
    }
    updateAllocatedWorkers(gameState.agents, gameState.planets);
    if (process.env.SIM_DEBUG === '1') {
        const d = checkPopulationWorkforceConsistency(gameState.agents, gameState.planets);
        if (d.length) {
            throw new Error(`after updateAllocatedWorkers: ${d.join('; ')}`);
        }
    }
    laborMarketTick(gameState.agents, gameState.planets);
    if (process.env.SIM_DEBUG === '1') {
        const d = checkPopulationWorkforceConsistency(gameState.agents, gameState.planets);
        if (d.length) {
            throw new Error(`after laborMarketTick: ${d.join('; ')}`);
        }
    }
    populationTick(gameState);
    if (process.env.SIM_DEBUG === '1') {
        const d = checkPopulationWorkforceConsistency(gameState.agents, gameState.planets);
        if (d.length) {
            throw new Error(`after populationTick: ${d.join('; ')}`);
        }
    }
    productionTick(gameState);
    if (process.env.SIM_DEBUG === '1') {
        const d = checkPopulationWorkforceConsistency(gameState.agents, gameState.planets);
        if (d.length) {
            throw new Error(`after productionTick: ${d.join('; ')}`);
        }
    }

    if (isMonthBoundary(gameState.tick)) {
        laborMarketMonthTick(gameState.agents, gameState.planets);
    }

    if (isYearBoundary(gameState.tick)) {
        populationAdvanceYearTick(gameState);
        laborMarketYearTick(gameState.agents);
    }

    // Final check
    if (process.env.SIM_DEBUG === '1') {
        const d = checkPopulationWorkforceConsistency(gameState.agents, gameState.planets);
        if (d.length) {
            throw new Error(`after advanceTick: ${d.join('; ')}`);
        }
    }
}
