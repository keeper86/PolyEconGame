import assert from 'assert';
import {
    BID_OFFER_MAX_COST_MULTIPLIER,
    COST_SPRING_STRENGTH,
    EPSILON,
    INPUT_BUFFER_TARGET_TICKS,
    INPUT_BUFFER_TARGET_TICKS_SERVICES,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_UP,
    PRICE_CEIL,
    PRICE_FLOOR,
} from '../constants';
import type { Resource } from '../planet/claims';
import { queryStorageFacility } from '../planet/facility';
import type { Agent, AgentMarketBidState, AgentMarketOfferState, Planet } from '../planet/planet';
import { constructionServiceResourceType } from '../planet/services';

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

    // SELLING SIDE
    const inputReserve = new Map<string, number>();
    for (const facility of assets.productionFacilities) {
        for (const { resource, quantity } of facility.needs) {
            if (resource.form === 'landBoundResource') {
                continue;
            }
            const bufferTarget =
                resource.form === 'services' ? INPUT_BUFFER_TARGET_TICKS_SERVICES : INPUT_BUFFER_TARGET_TICKS;
            const target = quantity * facility.scale * bufferTarget;
            inputReserve.set(resource.name, (inputReserve.get(resource.name) ?? 0) + target);
        }
    }
    for (const facility of assets.managementFacilities) {
        for (const { resource, quantity } of facility.needs) {
            if (resource.form === 'landBoundResource') {
                continue;
            }
            const bufferTarget =
                resource.form === 'services' ? INPUT_BUFFER_TARGET_TICKS_SERVICES : INPUT_BUFFER_TARGET_TICKS;
            const target = quantity * facility.scale * bufferTarget;
            inputReserve.set(resource.name, (inputReserve.get(resource.name) ?? 0) + target);
        }
    }
    for (const facility of [
        ...assets.productionFacilities,
        ...assets.managementFacilities,
        ...assets.shipConstructionFacilities,
    ]) {
        if (facility.construction === null) {
            continue;
        }
        const target = facility.construction.maximumConstructionServiceConsumption * INPUT_BUFFER_TARGET_TICKS;
        inputReserve.set(
            constructionServiceResourceType.name,
            (inputReserve.get(constructionServiceResourceType.name) ?? 0) + target,
        );
    }
    for (const ship of agent.ships) {
        if (
            ship.type.type === 'construction' &&
            ship.state.type === 'pre-fabrication' &&
            ship.state.planetId === planet.id &&
            ship.state.buildingTarget !== null &&
            ship.state.buildingTarget.construction !== null
        ) {
            const target =
                ship.state.buildingTarget.construction.maximumConstructionServiceConsumption *
                INPUT_BUFFER_TARGET_TICKS;
            inputReserve.set(
                constructionServiceResourceType.name,
                (inputReserve.get(constructionServiceResourceType.name) ?? 0) + target,
            );
        }
    }

    for (const facility of assets.shipConstructionFacilities) {
        if (facility.construction !== null) {
            continue;
        }
        if (facility.produces) {
            const ratePerTick = Math.min(1, Math.sqrt(facility.scale) / facility.produces.buildingTime);
            for (const need of facility.produces.buildingCost) {
                const bufferTarget =
                    need.resource.form === 'services' ? INPUT_BUFFER_TARGET_TICKS_SERVICES : INPUT_BUFFER_TARGET_TICKS;
                const target = need.quantity * ratePerTick * bufferTarget;
                inputReserve.set(need.resource.name, (inputReserve.get(need.resource.name) ?? 0) + target);
            }
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

            const initialPrice = planet.marketPrices[resource.name];
            const costFloor = planet.lastProductionCostFloors[resource.name];

            if (costFloor !== undefined && costFloor < PRICE_FLOOR) {
                console.warn(
                    `Cost floor for resource ${resource.name} on planet ${planet.id} is below PRICE_FLOOR (${costFloor}). ` +
                        `This may lead to unstable pricing. Clamping to PRICE_FLOOR.`,
                );
            }

            adjustOfferPrice(offer, inventoryQty, initialPrice, costFloor);
        }
    }

    // BUYING SIDE
    const aggregatedBuyTargets = new Map<string, { resource: Resource; storageTarget: number }>();

    for (const facility of [
        ...assets.productionFacilities,
        ...assets.managementFacilities,
        ...assets.shipConstructionFacilities,
    ]) {
        if (facility.construction === null || facility.construction.type === 'expansion') {
            // Facilities with construction.type === 'expansion' still produce while expanding,
            // so they need their normal input buffer in addition to construction services.
            let needs = [];
            if (facility.type === 'ship_construction') {
                needs = (facility.produces?.buildingCost ?? []).map((resource) => {
                    return {
                        resource: resource.resource,
                        quantity: resource.quantity * Math.max(0, 1 / (facility.produces?.buildingTime ?? 1)),
                    };
                });
            } else {
                needs = facility.needs;
            }

            for (const { resource, quantity } of needs) {
                if (resource.form === 'landBoundResource') {
                    continue;
                }

                const bufferTarget =
                    resource.form === 'services' ? INPUT_BUFFER_TARGET_TICKS_SERVICES : INPUT_BUFFER_TARGET_TICKS;
                const facilityTarget = quantity * facility.scale * bufferTarget;

                const existing = aggregatedBuyTargets.get(resource.name);
                if (existing) {
                    existing.storageTarget += facilityTarget;
                } else {
                    aggregatedBuyTargets.set(resource.name, { resource, storageTarget: facilityTarget });
                }
            }
        }
        if (facility.construction !== null) {
            // Under construction → target construction service input buffer
            const facilityTarget =
                facility.construction.maximumConstructionServiceConsumption * INPUT_BUFFER_TARGET_TICKS_SERVICES;
            const existing = aggregatedBuyTargets.get(constructionServiceResourceType.name);
            if (existing) {
                existing.storageTarget += facilityTarget;
            } else {
                aggregatedBuyTargets.set(constructionServiceResourceType.name, {
                    resource: constructionServiceResourceType,
                    storageTarget: facilityTarget,
                });
            }
        }
    }

    for (const ship of agent.ships) {
        if (
            ship.type.type === 'construction' &&
            ship.state.type === 'pre-fabrication' &&
            ship.state.planetId === planet.id &&
            ship.state.buildingTarget !== null &&
            ship.state.buildingTarget.construction !== null
        ) {
            const shipTarget =
                ship.state.buildingTarget.construction.maximumConstructionServiceConsumption *
                INPUT_BUFFER_TARGET_TICKS_SERVICES;
            const existing = aggregatedBuyTargets.get(constructionServiceResourceType.name);
            if (existing) {
                existing.storageTarget += shipTarget;
            } else {
                aggregatedBuyTargets.set(constructionServiceResourceType.name, {
                    resource: constructionServiceResourceType,
                    storageTarget: shipTarget,
                });
            }
        }
        // Transport ships in loading state need their cargoGoal quantity; this surfaces the
        // demand as an automated buy entry so the market bid is always visible and price-adjusted.
        if (
            ship.type.type === 'transport' &&
            ship.state.type === 'loading' &&
            ship.state.planetId === planet.id &&
            ship.state.cargoGoal != null
        ) {
            const { resource, quantity } = ship.state.cargoGoal;
            const alreadyLoaded = ship.state.currentCargo?.quantity ?? 0;
            const remaining = quantity - alreadyLoaded;
            if (remaining > 0) {
                const existing = aggregatedBuyTargets.get(resource.name);
                if (existing) {
                    existing.storageTarget += remaining;
                } else {
                    aggregatedBuyTargets.set(resource.name, { resource, storageTarget: remaining });
                }
            }
        }
    }

    // Set automated buy entries that are no longer needed to 0 (e.g. construction finished)
    // but keep in object as it can be confusing if it just vanishes.
    for (const resourceName of Object.keys(assets.market.buy)) {
        if (assets.market.buy[resourceName].automated && !aggregatedBuyTargets.has(resourceName)) {
            assets.market.buy[resourceName].bidStorageTarget = 0;
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
        assert(bid.resource.name === resource.name, 'Resource mismatch in buy bid');

        const currentInventory = queryStorageFacility(assets.storageFacility, resourceName);
        const shortfall = Math.max(0, storageTarget - currentInventory);

        const marketPrice = planet.marketPrices[resourceName];
        const costFloor = planet.lastProductionCostFloors[resourceName] ?? PRICE_FLOOR;
        const bidCeil = Math.min(PRICE_CEIL, costFloor * BID_OFFER_MAX_COST_MULTIPLIER);
        if (bidCeil < PRICE_FLOOR) {
            console.warn(
                `Calculated bid ceiling ${bidCeil} for resource ${resourceName} on planet ${planet.id} is below PRICE_FLOOR. ` +
                    `This may lead to unstable pricing. Setting bid ceiling to PRICE_FLOOR.`,
            );
        }
        adjustBidPrice(bid, shortfall, storageTarget, marketPrice, bidCeil);

        if (!bid.bidPrice || !isFinite(bid.bidPrice) || bid.bidPrice < PRICE_FLOOR) {
            console.warn(
                `Calculated invalid bid price ${bid.bidPrice} for agent ${agent.id} resource ${resourceName}. ` +
                    `Resetting to market price.`,
            );
            bid.bidPrice = Math.max(PRICE_FLOOR, isFinite(marketPrice) ? marketPrice : PRICE_FLOOR);
        }
    }
}

const TARGET_SELL_THROUGH = 0.9;
const SERVICE_SELL_THROUGH_TARGET = 0.97;

function sellThroughFactor(sellThrough: number, target: number = TARGET_SELL_THROUGH): number {
    const clamped = Math.max(0, Math.min(1, sellThrough));
    if (clamped >= target) {
        const t = (clamped - target) / (1 - target);
        return 1 + t * (PRICE_ADJUST_MAX_UP - 1);
    } else {
        const t = clamped / target;
        return PRICE_ADJUST_MAX_DOWN + t * (1 - PRICE_ADJUST_MAX_DOWN);
    }
}

export const AUTOMATED_COST_FLOOR_BUFFER = 0.5;
export function adjustOfferPrice(
    offer: AgentMarketOfferState,
    inventoryQty: number,
    initialPrice: number,
    costFloor: number = PRICE_FLOOR,
): void {
    const sold = offer.lastSold;
    const price = offer.offerPrice;

    if (sold === undefined || price === undefined) {
        offer.offerPrice = Math.max(PRICE_FLOOR, initialPrice);
        return;
    }

    // Calculate effective sell quantity based on retainment
    const retainment = offer.offerRetainment ?? 0;
    const effectiveQuantity = Math.max(0, inventoryQty - retainment);

    if (effectiveQuantity === 0) {
        if (sold > 0 && price > 0) {
            const factor = sellThroughFactor(1); // Full sell-through
            const newPrice = price * factor;
            offer.offerPrice = Math.min(PRICE_CEIL, Math.max(PRICE_FLOOR, newPrice));
        }
        return;
    }

    const sellThrough = sold / effectiveQuantity;
    const factor = sellThroughFactor(
        sellThrough,
        offer.resource.form === 'services' ? SERVICE_SELL_THROUGH_TARGET : TARGET_SELL_THROUGH,
    );

    const brakeZoneTop = costFloor * (1 + AUTOMATED_COST_FLOOR_BUFFER * (offer.resource.form === 'services' ? 0.5 : 1));

    // Offer spring kicks in 1 step below the bid ceiling, creating a last-resort trade window
    // where bids (capped at BID_OFFER_MAX_COST_MULTIPLIER × floor) can still exceed offers.
    const overPriceGuard = costFloor > PRICE_FLOOR ? costFloor * (BID_OFFER_MAX_COST_MULTIPLIER - 1) : PRICE_CEIL;

    // sqrt-scaled spring: force grows with distance so extreme deviations
    // always overcome the max sell-through/fill-rate factor (±0.05).
    const deviation = Math.sqrt(Math.max(0, brakeZoneTop / price - 1));
    const overDeviation = Math.sqrt(Math.max(0, price / overPriceGuard - 1));

    const newPrice = price * (factor + COST_SPRING_STRENGTH * deviation - COST_SPRING_STRENGTH * overDeviation);

    // Ensure price is always at least PRICE_FLOOR and not NaN/Infinity
    if (!isFinite(newPrice) || newPrice < PRICE_FLOOR) {
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
    ceilingPrice: number = PRICE_CEIL,
): void {
    // Handle extremely small shortfalls - treat as no demand
    if (shortfall > 0 && shortfall < EPSILON) {
        bid.bidStorageTarget = storageTarget - shortfall < EPSILON ? 0 : storageTarget - shortfall; // Effectively current inventory
        // Keep existing price or initialize it from market price
        if (bid.bidPrice === undefined || bid.bidPrice <= 0) {
            const newPrice = marketPrice;
            bid.bidPrice = Math.max(PRICE_FLOOR, newPrice);
        }
        return;
    }

    bid.bidStorageTarget = storageTarget < EPSILON ? 0 : storageTarget;

    if (shortfall <= 0) {
        // No demand. Keep existing price or initialize it from market price.
        if (bid.bidPrice === undefined || bid.bidPrice <= 0) {
            const newPrice = marketPrice;
            bid.bidPrice = Math.max(PRICE_FLOOR, newPrice);
        }
        return;
    }

    // If bid price is undefined, 0, or negative, initialize it
    if (bid.bidPrice === undefined || bid.bidPrice <= 0) {
        bid.bidPrice = marketPrice;
        bid.bidPrice = Math.max(PRICE_FLOOR, bid.bidPrice);
        return;
    }

    const lastBought = bid.lastBought ?? 0;

    const lastDemanded = bid.lastEffectiveQty ?? shortfall;
    const fillRate = lastDemanded > 0 ? lastBought / lastDemanded : 1;

    const baseFactor = fillRateFactor(fillRate);

    const overDeviation = Math.sqrt(Math.max(0, bid.bidPrice / ceilingPrice - 1));
    const ceilingSpring = COST_SPRING_STRENGTH * overDeviation;
    const factor = baseFactor - ceilingSpring;

    const newPrice = bid.bidPrice * factor;

    // Ensure price is always at least PRICE_FLOOR and not NaN/Infinity
    if (!isFinite(newPrice) || newPrice <= 0) {
        bid.bidPrice = PRICE_FLOOR;
    } else {
        bid.bidPrice = Math.max(PRICE_FLOOR, Math.min(PRICE_CEIL, newPrice));
    }
}
