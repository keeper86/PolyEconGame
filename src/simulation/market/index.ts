/**
 * market/index.ts
 *
 * Barrel file for the market subsystem.
 * Exports the per-tick entry points:
 *   1. updateAgentPricing — per-agent food price setting (like updateAllocatedWorkers)
 *   2. foodMarketTick — demand formation, merit-order clearing
 *   3. intergenerationalTransfersTick — structured family support
 *   4. wealthDiffusionTick — low-temperature variance smoothing
 */

export { updateAgentPricing } from './agentPricing';
export { foodMarketTick } from './foodMarket';
export { intergenerationalTransfersTick } from './intergenerationalTransfers';
export { wealthDiffusionTick } from './wealthDiffusion';
export {
    ensureFoodMarket,
    getFoodBufferDemography,
    emptyFoodBufferCohort,
    expectedPurchaseQuantity,
} from './foodMarketHelpers';
