import { INITIAL_FOOD_PRICE, PRICE_ADJUST_MAX_DOWN, PRICE_ADJUST_MAX_UP } from '../constants';
import type { Agent, AgentMarketBidState, AgentMarketOfferState, Planet } from '../planet/planet';
import { queryStorageFacility } from '../planet/storage';

/**
 * Number of ticks of input stock the agent wants to maintain as a buffer.
 * E.g. 30 means the agent tries to keep 30 ticks' worth of each required input.
 */
const INPUT_BUFFER_TARGET_TICKS = 30;

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

    if (!assets.market) {
        assets.market = { sell: {}, buy: {} };
    }
    if (!assets.market.buy) {
        assets.market.buy = {};
    }

    // Pre-compute the total input buffer the agent wants to keep for each
    // stored resource across all facilities.  Sell offers must not exceed
    // inventory minus this reserved amount, otherwise the agent sells inputs
    // it still needs for its own production next tick.
    const inputReserve = new Map<string, number>();
    for (const facility of assets.productionFacilities) {
        for (const { resource, quantity } of facility.needs) {
            if (resource.form === 'landBoundResource') {
                continue;
            }
            const target = quantity * facility.scale * INPUT_BUFFER_TARGET_TICKS;
            inputReserve.set(resource.name, (inputReserve.get(resource.name) ?? 0) + target);
        }
    }

    for (const facility of assets.productionFacilities) {
        for (const { resource } of facility.produces) {
            const inventoryQty = queryStorageFacility(assets.storageFacility, resource.name);
            const reserved = inputReserve.get(resource.name) ?? 0;
            const sellableQty = Math.max(0, inventoryQty - reserved);

            if (!assets.market.sell[resource.name]) {
                assets.market.sell[resource.name] = { resource };
            }

            const offer = assets.market.sell[resource.name];
            offer.resource = resource;

            const initialPrice = planet.marketPrices[resource.name] ?? INITIAL_FOOD_PRICE;
            adjustOfferPrice(offer, sellableQty, initialPrice);
        }

        for (const { resource, quantity } of facility.needs) {
            if (resource.form === 'landBoundResource') {
                continue;
            }

            const inventoryQty = queryStorageFacility(assets.storageFacility, resource.name);
            const targetQty = quantity * facility.scale * INPUT_BUFFER_TARGET_TICKS;
            const shortfall = Math.max(0, targetQty - inventoryQty);

            if (!assets.market.buy[resource.name]) {
                assets.market.buy[resource.name] = { resource };
            }

            const bid = assets.market.buy[resource.name];
            bid.resource = resource;

            adjustBidPrice(bid, shortfall, planet.marketPrices[resource.name] ?? INITIAL_FOOD_PRICE);
        }
    }
}

// ---------------------------------------------------------------------------
// Tâtonnement price adjustment helpers
// ---------------------------------------------------------------------------

const TARGET_SELL_THROUGH = 0.9;
const ADJUSTMENT_SPEED = 0.2;

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

/**
 * Update the bid price and quantity for a single input-resource bid.
 * When there is a shortfall the agent bids at the current market price,
 * scaling up slightly when the shortfall is large (urgency premium).
 */
function adjustBidPrice(bid: AgentMarketBidState, shortfall: number, marketPrice: number): void {
    bid.bidQuantity = shortfall;

    if (shortfall <= 0) {
        bid.bidPrice = 0;
        return;
    }

    if (bid.bidPrice === undefined) {
        bid.bidPrice = marketPrice;
        return;
    }

    const lastBought = bid.lastBought ?? 0;
    const lastDemanded = bid.bidQuantity > 0 ? shortfall : 1;
    const fillRate = lastDemanded > 0 ? lastBought / lastDemanded : 1;

    const fillDeficit = Math.max(0, 1 - fillRate);
    let factor = 1 + ADJUSTMENT_SPEED * fillDeficit;
    factor = Math.min(PRICE_ADJUST_MAX_UP, Math.max(1, factor));

    const priceFloor = 0.01;
    const priceCeil = 1000000;
    bid.bidPrice = Math.min(priceCeil, Math.max(priceFloor, bid.bidPrice * factor));
}
