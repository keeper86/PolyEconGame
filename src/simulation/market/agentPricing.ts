/**
 * market/agentPricing.ts
 *
 * Per-agent food-pricing AI — each food-producing company sets its own
 * price and offer quantity for the next market tick.
 *
 * Design (mirrors `updateAllocatedWorkers`):
 *
 * 1. **Bootstrap (first tick / no history):**  Use INITIAL_FOOD_PRICE and
 *    offer the full storage quantity.
 *
 * 2. **Feedback path:**  Compute the pricing metric
 *
 *      M = (produced − sold)² − a × inventory
 *
 *    where `a = INVENTORY_PENALTY_WEIGHT`.  The agent wants to *minimise* M
 *    (i.e. sold ≈ produced, and low inventory).
 *
 *    The discrete gradient with respect to the price multiplier is estimated
 *    from the sign of (produced − sold): if the agent produced more than it
 *    sold, price is too high → lower it; if sold ≈ produced and inventory is
 *    piling up, price is also too high.
 *
 *    Adjustment:  p_new = p_old × clamp(factor, PRICE_ADJUST_MAX_DOWN, PRICE_ADJUST_MAX_UP)
 *
 * 3. **Offer quantity:**  The agent offers all food currently in its storage
 *    facility.  (A human player can override both price and quantity.)
 *
 * Call once per tick AFTER productionTick and BEFORE foodMarketTick.
 */

import type { Agent, GameState, Planet } from '../planet';
import {
    INITIAL_FOOD_PRICE,
    FOOD_PRICE_FLOOR,
    INVENTORY_PENALTY_WEIGHT,
    PRICE_ADJUST_MAX_UP,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_SENSITIVITY,
} from '../constants';
import { agriculturalProductResourceType, queryStorageFacility } from '../facilities';

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Recompute every food-producing agent's `foodOfferPrice` and
 * `foodOfferQuantity` for the upcoming market clearing tick.
 */
export function updateAgentPricing(gameState: GameState): void {
    gameState.planets.forEach((planet) => {
        gameState.agents.forEach((agent) => {
            updatePricingForAgent(agent, planet);
        });
    });
}

// ---------------------------------------------------------------------------
// Per-agent pricing logic
// ---------------------------------------------------------------------------

function updatePricingForAgent(agent: Agent, planet: Planet): void {
    const assets = agent.assets[planet.id];
    if (!assets) {
        return;
    }

    // Check if this agent produces food
    const hasFoodProduction = assets.productionFacilities.some((f) =>
        f.produces.some((p) => p.resource.name === agriculturalProductResourceType.name),
    );
    if (!hasFoodProduction) {
        return;
    }

    // Current food in storage = what we offer to the market
    const currentInventory = queryStorageFacility(assets.storageFacility, agriculturalProductResourceType.name);
    assets.foodOfferQuantity = currentInventory;

    const hasHistory =
        assets.lastFoodProduced !== undefined &&
        assets.lastFoodSold !== undefined &&
        assets.foodOfferPrice !== undefined;

    if (!hasHistory) {
        // Bootstrap: use initial price, offer everything
        assets.foodOfferPrice = INITIAL_FOOD_PRICE;
        return;
    }

    // --- Feedback path ---
    const produced = assets.lastFoodProduced!;
    const sold = assets.lastFoodSold!;
    const oldPrice = assets.foodOfferPrice!;

    // Metric M = (produced - sold)² - a * inventory
    // We want to minimise M.
    // ∂M/∂price ≈ sign based reasoning:
    //   If produced > sold  → excess supply, price too high → lower price
    //   If produced < sold  → excess demand, price too low  → raise price
    //   If inventory is high → additional pressure to lower price
    const excessSupply = produced - sold;
    const inventoryPressure = INVENTORY_PENALTY_WEIGHT * currentInventory;

    // Combined gradient signal: positive ⇒ lower price, negative ⇒ raise price
    const gradientSignal = excessSupply + inventoryPressure;

    // Multiplicative adjustment: clamp to [MAX_DOWN, MAX_UP]
    const rawFactor = 1 - PRICE_ADJUST_SENSITIVITY * gradientSignal;
    const factor = Math.min(PRICE_ADJUST_MAX_UP, Math.max(PRICE_ADJUST_MAX_DOWN, rawFactor));

    const newPrice = Math.max(FOOD_PRICE_FLOOR, oldPrice * factor);
    assets.foodOfferPrice = newPrice;
}
