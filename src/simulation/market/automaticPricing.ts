import {
    FOOD_PRICE_CEIL,
    FOOD_PRICE_FLOOR,
    INITIAL_FOOD_PRICE,
    INPUT_BUFFER_TARGET_TICKS,
    OUTPUT_BUFFER_MAX_TICKS,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_UP,
} from '../constants';
import type { Agent, AgentMarketBidState, AgentMarketOfferState, Planet } from '../planet/planet';
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

    // Pre-compute the break-even input price ceiling for each traded input resource.
    // For each unit of input, the maximum rational price equals the revenue it contributes
    // to the facility's output: Σ(output_qty × output_price) / input_qty.
    // When a resource is used across multiple facilities, we take the highest ceiling
    // (the agent values it at whatever facility extracts the most value from it).
    //
    // For outputs without a market price yet, we fall back to the total input cost per
    // output unit (break-even floor). This prevents the ceiling from collapsing to
    // INITIAL_FOOD_PRICE when a downstream product has never been traded.
    const inputValueCeiling = new Map<string, number>();
    for (const facility of assets.productionFacilities) {
        const tradedInputCostPerScale = facility.needs.reduce((sum, { resource, quantity }) => {
            if (resource.form === 'landBoundResource') {
                return sum;
            }
            return sum + quantity * (planet.marketPrices[resource.name] ?? INITIAL_FOOD_PRICE);
        }, 0);
        const totalOutputQty = facility.produces.reduce((sum, p) => sum + p.quantity, 0);
        const inputCostFallbackPerOutputUnit =
            totalOutputQty > 0 ? tradedInputCostPerScale / totalOutputQty : INITIAL_FOOD_PRICE;

        const outputRevenuePerScale = facility.produces.reduce((sum, p) => {
            const knownPrice = planet.marketPrices[p.resource.name];
            const price = knownPrice ?? inputCostFallbackPerOutputUnit;
            return sum + p.quantity * price;
        }, 0);

        for (const { resource, quantity } of facility.needs) {
            if (resource.form === 'landBoundResource' || quantity <= 0) {
                continue;
            }
            const ceiling = outputRevenuePerScale / quantity;
            const existing = inputValueCeiling.get(resource.name) ?? 0;
            if (ceiling > existing) {
                inputValueCeiling.set(resource.name, ceiling);
            }
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

            const outputBufferFull = facility.produces.every(({ resource: out, quantity: outQty }) => {
                const outInventory = queryStorageFacility(assets.storageFacility, out.name);
                return outInventory >= outQty * facility.scale * OUTPUT_BUFFER_MAX_TICKS;
            });

            const inventoryQty = queryStorageFacility(assets.storageFacility, resource.name);
            const targetQty = quantity * facility.scale * INPUT_BUFFER_TARGET_TICKS;
            const shortfall = outputBufferFull ? 0 : Math.max(0, targetQty - inventoryQty);

            if (!assets.market.buy[resource.name]) {
                assets.market.buy[resource.name] = { resource };
            }

            const bid = assets.market.buy[resource.name];
            bid.resource = resource;

            const marketPrice = planet.marketPrices[resource.name] ?? INITIAL_FOOD_PRICE;
            const ceiling = inputValueCeiling.get(resource.name);
            adjustBidPrice(bid, shortfall, marketPrice, ceiling);
        }
    }
}

// ---------------------------------------------------------------------------
// Tâtonnement price adjustment helpers
// ---------------------------------------------------------------------------

const TARGET_SELL_THROUGH = 0.9;

/**
 * Map sell-through ∈ [0, 1] onto a price-adjustment factor using two linear
 * segments that each span the full configured range:
 *
 *   sellThrough = 0             → PRICE_ADJUST_MAX_DOWN   (max price cut)
 *   sellThrough = TARGET        → 1.0                     (no change)
 *   sellThrough = 1             → PRICE_ADJUST_MAX_UP     (max price rise)
 *
 * The single-segment formula `1 + speed * (sellThrough - TARGET)` only ever
 * reaches a factor of ~1.02 at full sell-through (= 1 + speed * 0.1), making
 * the PRICE_ADJUST_MAX_UP cap unreachable and creating a strong downward bias
 * once a price has been pushed to the floor.
 */
function sellThroughFactor(sellThrough: number): number {
    const clamped = Math.max(0, Math.min(1, sellThrough));
    if (clamped >= TARGET_SELL_THROUGH) {
        const t = (clamped - TARGET_SELL_THROUGH) / (1 - TARGET_SELL_THROUGH);
        return 1 + t * (PRICE_ADJUST_MAX_UP - 1);
    } else {
        const t = clamped / TARGET_SELL_THROUGH;
        return PRICE_ADJUST_MAX_DOWN + t * (1 - PRICE_ADJUST_MAX_DOWN);
    }
}

function adjustOfferPrice(offer: AgentMarketOfferState, newOfferQuantity: number, initialPrice: number): void {
    offer.offerQuantity = newOfferQuantity;

    const sold = offer.lastSold;
    const price = offer.offerPrice;

    if (sold === undefined || price === undefined) {
        offer.offerPrice = initialPrice;
        return;
    }

    // When the agent has no stock this tick (supply-constrained), treat it as
    // full sell-through: the good is scarce and the price should rise.
    if (newOfferQuantity === 0) {
        const factor = sellThroughFactor(1);
        offer.offerPrice = Math.min(FOOD_PRICE_CEIL, Math.max(FOOD_PRICE_FLOOR, price * factor));
        return;
    }

    const sellThrough = sold / newOfferQuantity;
    const factor = sellThroughFactor(sellThrough);

    const priceCeil = FOOD_PRICE_CEIL;
    const priceFloor = FOOD_PRICE_FLOOR;
    offer.offerPrice = Math.min(priceCeil, Math.max(priceFloor, price * factor));
}

/**
 * Map fill rate ∈ [0, 1] onto a price-adjustment factor using two linear
 * segments symmetric to sellThroughFactor:
 *
 *   fillRate = 0              → PRICE_ADJUST_MAX_UP   (max price rise — can't get anything)
 *   fillRate = TARGET         → 1.0                   (no change)
 *   fillRate = 1              → PRICE_ADJUST_MAX_DOWN (max price cut — always fully filled)
 */
const TARGET_FILL_RATE = 0.9;

function fillRateFactor(fillRate: number): number {
    const clamped = Math.max(0, Math.min(1, fillRate));
    if (clamped >= TARGET_FILL_RATE) {
        const t = (clamped - TARGET_FILL_RATE) / (1 - TARGET_FILL_RATE);
        return 1 + t * (PRICE_ADJUST_MAX_DOWN - 1);
    } else {
        const t = clamped / TARGET_FILL_RATE;
        return PRICE_ADJUST_MAX_UP + t * (1 - PRICE_ADJUST_MAX_UP);
    }
}

function adjustBidPrice(
    bid: AgentMarketBidState,
    shortfall: number,
    marketPrice: number,
    breakEvenCeiling?: number,
): void {
    const previousDemand = bid.bidQuantity;
    bid.bidQuantity = shortfall;

    if (shortfall <= 0) {
        bid.bidPrice = 0;
        return;
    }

    if (bid.bidPrice === undefined) {
        bid.bidPrice = breakEvenCeiling !== undefined ? Math.min(marketPrice, breakEvenCeiling) : marketPrice;
        return;
    }

    const lastBought = bid.lastBought ?? 0;
    const lastDemanded = previousDemand ?? shortfall;
    const fillRate = lastDemanded > 0 ? lastBought / lastDemanded : 1;

    const factor = fillRateFactor(fillRate);

    const priceFloor = FOOD_PRICE_FLOOR;
    const priceCeil = breakEvenCeiling !== undefined ? breakEvenCeiling : FOOD_PRICE_CEIL;
    bid.bidPrice = Math.max(priceFloor, Math.min(priceCeil, bid.bidPrice * factor));
}
