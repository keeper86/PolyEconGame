import { INITIAL_FOOD_PRICE, PRICE_ADJUST_MAX_DOWN, PRICE_ADJUST_MAX_UP } from '../constants';
import type { Agent, AgentMarketOfferState, Planet } from '../planet/planet';
import { queryStorageFacility } from '../planet/storage';

export function automaticPricing(agents: Map<string, Agent>, planet: Planet): void {
    agents.forEach((agent) => {
        automaticPricingForAgent(agent, planet);
    });
}

function automaticPricingForAgent(agent: Agent, planet: Planet): void {
    if (!agent.automated && !agent.automatePricing) {
        return;
    }
    const assets = agent.assets[planet.id];
    if (!assets) {
        return;
    }

    // Ensure the market state object exists.
    if (!assets.market) {
        assets.market = { sell: {} };
    }

    // Walk all production facilities and register/update sell offers for every
    // resource they produce.
    for (const facility of assets.productionFacilities) {
        for (const { resource } of facility.produces) {
            const inventoryQty = queryStorageFacility(assets.storageFacility, resource.name);

            // Ensure an offer entry exists for this resource.
            if (!assets.market.sell[resource.name]) {
                assets.market.sell[resource.name] = { resource };
            }

            const offer = assets.market.sell[resource.name];
            // Keep the resource reference up to date (it's the canonical object).
            offer.resource = resource;

            // Determine the initial / fallback price for this resource.
            // For now we use INITIAL_FOOD_PRICE for all goods.  A per-resource
            // initial price registry can be added later.
            const initialPrice = planet.marketPrices[resource.name] ?? INITIAL_FOOD_PRICE;

            adjustOfferPrice(offer, inventoryQty, initialPrice);
        }
    }
}

// ---------------------------------------------------------------------------
// Tâtonnement price adjustment helper
// ---------------------------------------------------------------------------
const TARGET_SELL_THROUGH = 0.9;
const ADJUSTMENT_SPEED = 0.2;
/**
 * Update the offer price and quantity for a single resource offer based on
 * the previous tick's sell-through ratio.
 */

function adjustOfferPrice(offer: AgentMarketOfferState, newOfferQuantity: number, initialPrice: number): void {
    offer.offerQuantity = newOfferQuantity;

    const sold = offer.lastSold;
    const price = offer.offerPrice;

    if (sold === undefined || price === undefined) {
        offer.offerPrice = initialPrice;
        return;
    }

    const offered = Math.max(1, offer.offerQuantity ?? 1);
    const sellThrough = sold / offered;
    const excessDemand = sellThrough - TARGET_SELL_THROUGH;
    let factor = 1 + ADJUSTMENT_SPEED * excessDemand;
    factor = Math.min(PRICE_ADJUST_MAX_UP, Math.max(PRICE_ADJUST_MAX_DOWN, factor));

    const priceCeil = 1000000;
    const priceFloor = 0.01;
    offer.offerPrice = Math.min(priceCeil, Math.max(priceFloor, price * factor));
}
