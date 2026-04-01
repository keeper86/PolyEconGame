import {
    EPSILON,
    INITIAL_GROCERY_PRICE,
    INPUT_BUFFER_TARGET_TICKS,
    OUTPUT_BUFFER_MAX_TICKS,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_UP,
    GROCERY_PRICE_CEIL as PRICE_CEIL,
    GROCERY_PRICE_FLOOR as PRICE_FLOOR,
} from '../constants';
import type { Agent, AgentMarketBidState, AgentMarketOfferState, Planet } from '../planet/planet';
import { queryStorageFacility } from '../planet/storage';

export function automaticPricing(agents: Map<string, Agent>, planet: Planet): void {
    agents.forEach((agent) => {
        automaticPricingForAgent(agent, planet);
    });
}

function automaticPricingForAgent(agent: Agent, planet: Planet): void {
    const assets = agent.assets[planet.id];
    if (!assets) {
        return;
    }

    // For human-controlled agents, skip entirely if no resources are flagged for
    // per-resource automation (avoids unnecessary market state initialization).
    if (!agent.automated) {
        const hasAnyAuto =
            Object.values(assets.market?.sell ?? {}).some((e) => e.automated) ||
            Object.values(assets.market?.buy ?? {}).some((e) => e.automated);
        if (!hasAnyAuto) {
            return;
        }
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
            const bufferTarget = resource.form === 'services' ? 1 : INPUT_BUFFER_TARGET_TICKS;
            const target = quantity * facility.scale * bufferTarget;
            inputReserve.set(resource.name, (inputReserve.get(resource.name) ?? 0) + target);
        }
    }

    for (const facility of assets.productionFacilities) {
        for (const { resource } of facility.produces) {
            // For human-controlled agents only auto-adjust entries explicitly flagged
            if (!agent.automated && assets.market.sell[resource.name]?.automated !== true) {
                continue;
            }

            const inventoryQty = queryStorageFacility(assets.storageFacility, resource.name);
            const reserved = inputReserve.get(resource.name) ?? 0;

            if (!assets.market.sell[resource.name]) {
                assets.market.sell[resource.name] = { resource, automated: true };
            }

            const offer = assets.market.sell[resource.name];
            offer.resource = resource;
            offer.offerRetainment = reserved; // Keep at least the reserved amount

            const initialPrice = planet.marketPrices[resource.name] ?? INITIAL_GROCERY_PRICE;
            adjustOfferPrice(offer, inventoryQty, initialPrice);
        }
    }

    // Aggregate the desired storage target per input resource across all facilities.
    // A facility whose output buffer is full contributes 0 to its inputs' storage
    // target (no point buying more inputs when outputs can't leave storage), but
    // must not suppress the aggregate for other facilities that still need the resource.
    const aggregatedBuyTargets = new Map<
        string,
        { resource: (typeof assets.productionFacilities)[number]['needs'][number]['resource']; storageTarget: number }
    >();
    for (const facility of assets.productionFacilities) {
        const outputBufferFull = facility.produces.every(({ resource: out, quantity: outQty }) => {
            const outInventory = queryStorageFacility(assets.storageFacility, out.name);
            return outInventory >= outQty * facility.scale * OUTPUT_BUFFER_MAX_TICKS;
        });

        for (const { resource, quantity } of facility.needs) {
            if (resource.form === 'landBoundResource') {
                continue;
            }

            const bufferTarget = resource.form === 'services' ? 1 : INPUT_BUFFER_TARGET_TICKS;
            const facilityTarget = outputBufferFull ? 0 : quantity * facility.scale * bufferTarget;

            const existing = aggregatedBuyTargets.get(resource.name);
            if (existing) {
                existing.storageTarget += facilityTarget;
            } else {
                aggregatedBuyTargets.set(resource.name, { resource, storageTarget: facilityTarget });
            }
        }
    }

    for (const [resourceName, { resource, storageTarget }] of aggregatedBuyTargets) {
        // For human-controlled agents only auto-adjust entries explicitly flagged
        if (!agent.automated && assets.market.buy[resourceName]?.automated !== true) {
            continue;
        }

        if (!assets.market.buy[resourceName]) {
            assets.market.buy[resourceName] = { resource, automated: true };
        }
        const bid = assets.market.buy[resourceName];
        bid.resource = resource;

        const currentInventory = queryStorageFacility(assets.storageFacility, resourceName);
        const shortfall = Math.max(0, storageTarget - currentInventory);

        const marketPrice = planet.marketPrices[resourceName] ?? INITIAL_GROCERY_PRICE;
        adjustBidPrice(bid, shortfall, storageTarget, marketPrice);

        // Validity guard: price must be a finite positive number >= PRICE_FLOOR.
        // adjustBidPrice should guarantee this, but NaN/Infinity can leak in from
        // degenerate ceiling calculations, so we clamp defensively.
        if (!bid.bidPrice || !isFinite(bid.bidPrice) || bid.bidPrice < PRICE_FLOOR) {
            bid.bidPrice = Math.max(PRICE_FLOOR, isFinite(marketPrice) && marketPrice > 0 ? marketPrice : PRICE_FLOOR);
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

function adjustOfferPrice(offer: AgentMarketOfferState, inventoryQty: number, initialPrice: number): void {
    const sold = offer.lastSold;
    const price = offer.offerPrice;

    if (sold === undefined || price === undefined) {
        offer.offerPrice = Math.max(PRICE_FLOOR, initialPrice);
        return;
    }

    // Calculate effective sell quantity based on retainment
    const retainment = offer.offerRetainment ?? 0;
    const effectiveQuantity = Math.max(0, inventoryQty - retainment);

    // When the agent has no stock to sell this tick (supply-constrained), treat it as
    // full sell-through: the good is scarce and the price should rise.
    if (effectiveQuantity === 0) {
        if (sold > 0 && price > 0) {
            const factor = sellThroughFactor(1); // Full sell-through
            const newPrice = price * factor;
            offer.offerPrice = Math.min(PRICE_CEIL, Math.max(PRICE_FLOOR, newPrice));
        }
        return;
    }

    const sellThrough = sold / effectiveQuantity;
    const factor = sellThroughFactor(sellThrough);
    const newPrice = price * factor;

    // Ensure price is always at least PRICE_FLOOR and not NaN/Infinity
    if (!isFinite(newPrice) || newPrice <= 0) {
        offer.offerPrice = PRICE_FLOOR;
    } else {
        offer.offerPrice = Math.min(PRICE_CEIL, Math.max(PRICE_FLOOR, newPrice));
    }
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
    storageTarget: number,
    marketPrice: number,
    breakEvenCeiling?: number,
): void {
    // Handle extremely small shortfalls - treat as no demand
    if (shortfall > 0 && shortfall < EPSILON) {
        // No meaningful demand, set storage target to current inventory level
        // This prevents creating bids with quantities that would fail validation
        bid.bidStorageTarget = storageTarget - shortfall; // Effectively current inventory
        // Keep existing price or initialize it from market price
        if (bid.bidPrice === undefined || bid.bidPrice <= 0) {
            const newPrice = breakEvenCeiling !== undefined ? Math.min(marketPrice, breakEvenCeiling) : marketPrice;
            bid.bidPrice = Math.max(PRICE_FLOOR, newPrice);
        }
        return;
    }

    // Set the storage target — same field as the human player, so that disabling
    // automation leaves a fully visible, correctly bounded bid in the UI.
    bid.bidStorageTarget = storageTarget;

    if (shortfall <= 0) {
        // No demand. Keep existing price or initialize it from market price.
        if (bid.bidPrice === undefined || bid.bidPrice <= 0) {
            const newPrice = breakEvenCeiling !== undefined ? Math.min(marketPrice, breakEvenCeiling) : marketPrice;
            bid.bidPrice = Math.max(PRICE_FLOOR, newPrice);
        }
        return;
    }

    // If bid price is undefined, 0, or negative, initialize it
    if (bid.bidPrice === undefined || bid.bidPrice <= 0) {
        bid.bidPrice = breakEvenCeiling !== undefined ? Math.min(marketPrice, breakEvenCeiling) : marketPrice;
        bid.bidPrice = Math.max(PRICE_FLOOR, bid.bidPrice);
        return;
    }

    const lastBought = bid.lastBought ?? 0;
    // lastEffectiveQty is the quantity actually placed in the order book last tick
    // by collectAgentBids (after proportional deposit scaling). It is a better
    // denominator for fill-rate than the raw shortfall, which changes each tick.
    const lastDemanded = bid.lastEffectiveQty ?? shortfall;
    const fillRate = lastDemanded > 0 ? lastBought / lastDemanded : 1;

    const factor = fillRateFactor(fillRate);

    const priceCeil = breakEvenCeiling !== undefined ? breakEvenCeiling : PRICE_CEIL;
    const newPrice = bid.bidPrice * factor;

    // Ensure price is always at least PRICE_FLOOR and not NaN/Infinity
    if (!isFinite(newPrice) || newPrice <= 0) {
        bid.bidPrice = PRICE_FLOOR;
    } else {
        bid.bidPrice = Math.max(PRICE_FLOOR, Math.min(priceCeil, newPrice));
    }
}
