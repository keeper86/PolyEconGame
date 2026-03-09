/**
 * market/agentPricing.ts
 *
 * Walrasian tâtonnement price adjustment.
 *
 * Price reacts to excess demand:
 *
 *   excessDemand = sellThrough - targetSellThrough
 *
 * price_next = price * (1 + α * excessDemand)
 */

import type { Agent, GameState, Planet } from '../planet/planet';
import {
    INITIAL_FOOD_PRICE,
    FOOD_PRICE_FLOOR,
    PRICE_ADJUST_MAX_UP,
    PRICE_ADJUST_MAX_DOWN,
    FOOD_PRICE_CEIL,
} from '../constants';

import { agriculturalProductResourceType, queryStorageFacility } from '../planet/facilities';

const TARGET_SELL_THROUGH = 0.9;
const ADJUSTMENT_SPEED = 0.2;

export function updateAgentPricing(gameState: GameState): void {
    gameState.planets.forEach((planet) => {
        gameState.agents.forEach((agent) => {
            updatePricingForAgent(agent, planet);
        });
    });
}

function updatePricingForAgent(agent: Agent, planet: Planet): void {
    const assets = agent.assets[planet.id];
    if (!assets) {
        return;
    }

    const inventory = queryStorageFacility(assets.storageFacility, agriculturalProductResourceType.name);

    if (!assets.foodMarket) {
        assets.foodMarket = {};
    }

    assets.foodMarket.offerQuantity = inventory;

    const sold = assets.foodMarket.lastSold;
    const price = assets.foodMarket.offerPrice;

    if (sold === undefined || price === undefined) {
        assets.foodMarket.offerPrice = INITIAL_FOOD_PRICE;
        return;
    }

    const offered = Math.max(1, assets.foodMarket.offerQuantity ?? 1);

    const sellThrough = sold / offered;

    const excessDemand = sellThrough - TARGET_SELL_THROUGH;

    let factor = 1 + ADJUSTMENT_SPEED * excessDemand;

    factor = Math.min(PRICE_ADJUST_MAX_UP, Math.max(PRICE_ADJUST_MAX_DOWN, factor));

    const newPrice = Math.min(FOOD_PRICE_CEIL, Math.max(FOOD_PRICE_FLOOR, price * factor));

    assets.foodMarket.offerPrice = newPrice;
}
