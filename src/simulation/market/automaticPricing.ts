import assert from 'assert';
import {
    BID_OFFER_MAX_COST_MULTIPLIER,
    COST_SPRING_STRENGTH,
    EPSILON,
    FREE_QUANTITY_SMOOTHING_MAX_EXTRA,
    INPUT_BUFFER_TARGET_TICKS,
    INPUT_BUFFER_TARGET_TICKS_SERVICES,
    INVENTORY_SMOOTHING_MAX_EXTRA,
    OUTPUT_BUFFER_MAX_TICKS,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_UP,
    PRICE_CEIL,
    PRICE_FLOOR,
} from '../constants';
import type { Resource } from '../planet/claims';
import { queryStorageFacility } from '../planet/facility';
import type {
    Agent,
    AgentMarketBidState,
    AgentMarketOfferState,
    AutomatedPricingConfig,
    Planet,
} from '../planet/planet';
import { constructionServiceResourceType } from '../planet/services';
import { RESOURCES_BY_NAME } from '../planet/resourceCatalog';
import { initialMarketPrices } from '../initialUniverse/initialMarketPrices';
import { computeAllConsumptionRates } from './consumptionSources';
import { toConsumptionShipInfo } from './consumptionShipInfo';

// ── Config resolvers ──────────────────────────────────────────────────────────
// Each takes an optional config + the resource (to pick service-appropriate defaults),
// and returns a fully resolved config with all fields populated.

function resolveOfferConfig(config: AutomatedPricingConfig | undefined, resource: Resource) {
    const c = config ?? {};
    return {
        priceAdjustMaxUp: c.priceAdjustMaxUp ?? PRICE_ADJUST_MAX_UP,
        priceAdjustMaxDown: c.priceAdjustMaxDown ?? PRICE_ADJUST_MAX_DOWN,
        costSpringStrength: c.costSpringStrength ?? COST_SPRING_STRENGTH,
        bidOfferMaxCostMultiplier: c.bidOfferMaxCostMultiplier ?? BID_OFFER_MAX_COST_MULTIPLIER,
        inventorySmoothingMaxExtra: c.inventorySmoothingMaxExtra ?? INVENTORY_SMOOTHING_MAX_EXTRA,
        outputBufferMaxTicks: c.outputBufferMaxTicks ?? OUTPUT_BUFFER_MAX_TICKS,
        targetSellThrough: c.targetSellThrough ?? (resource.form === 'services' ? 0.95 : 0.9),
        automatedCostFloorBuffer: c.automatedCostFloorBuffer ?? 0.5,
        freeSellQuantity: c.freeSellQuantity ?? 0,
        freeSellQuantitySmoothingMaxExtra: c.freeSellQuantitySmoothingMaxExtra ?? FREE_QUANTITY_SMOOTHING_MAX_EXTRA,
    };
}

function resolveBidConfig(config: AutomatedPricingConfig | undefined, resource: Resource) {
    const c = config ?? {};
    return {
        priceAdjustMaxUp: c.priceAdjustMaxUp ?? PRICE_ADJUST_MAX_UP,
        priceAdjustMaxDown: c.priceAdjustMaxDown ?? PRICE_ADJUST_MAX_DOWN,
        costSpringStrength: c.costSpringStrength ?? COST_SPRING_STRENGTH,
        bidOfferMaxCostMultiplier: c.bidOfferMaxCostMultiplier ?? BID_OFFER_MAX_COST_MULTIPLIER,
        inventorySmoothingMaxExtra: c.inventorySmoothingMaxExtra ?? INVENTORY_SMOOTHING_MAX_EXTRA,
        inputBufferTargetTicks:
            c.inputBufferTargetTicks ??
            (resource.form === 'services' ? INPUT_BUFFER_TARGET_TICKS_SERVICES : INPUT_BUFFER_TARGET_TICKS),
        targetFillRate: c.targetFillRate ?? 0.9,
        freeBuyQuantity: c.freeBuyQuantity ?? 0,
        freeBuyQuantitySmoothingMaxExtra: c.freeBuyQuantitySmoothingMaxExtra ?? FREE_QUANTITY_SMOOTHING_MAX_EXTRA,
    };
}

/** Convenience: looks up the existing buy bid (if any) and resolves with that config + resource. */
function resolveBidConfigForResource(assets: import('../planet/planet').AgentPlanetAssets, resource: Resource) {
    return resolveBidConfig(assets.market.buy[resource.name]?.autoConfig, resource);
}

// ── Public API ────────────────────────────────────────────────────────────────

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

    // ── Input reserve (sell-side retainment) ──────────────────────────────────
    // Use the shared consumption function for raw rates, then multiply by
    // each resource's configured inputBufferTargetTicks.

    const shipsForConsumption = agent.ships.map(toConsumptionShipInfo);

    const consumptionRates = computeAllConsumptionRates(
        assets.productionFacilities,
        assets.managementFacilities,
        assets.shipConstructionFacilities,
        shipsForConsumption,
        planet.id,
    );

    const inputReserve = new Map<string, number>();
    for (const [resourceName, rate] of consumptionRates) {
        const resource = RESOURCES_BY_NAME.get(resourceName);
        if (!resource) {
            console.warn(
                `automaticPricing: unknown resource "${resourceName}" in consumption rates, skipping input reserve calculation.`,
            );
            continue;
        }
        const bidCfg = resolveBidConfigForResource(assets, resource);
        const target = rate * bidCfg.inputBufferTargetTicks;
        inputReserve.set(resourceName, target);
    }

    // ── Sell-side automated offers ───────────────────────────────────────────

    const productionRate = new Map<string, number>();

    for (const facility of assets.productionFacilities) {
        for (const { resource, quantity } of facility.produces) {
            if (!agent.automated && assets.market.sell[resource.name]?.automated !== true) {
                continue;
            }

            productionRate.set(resource.name, (productionRate.get(resource.name) ?? 0) + quantity * facility.scale);

            const inventoryQty = queryStorageFacility(assets.storageFacility, resource.name);
            const reserved = inputReserve.get(resource.name) ?? 0;

            if (!assets.market.sell[resource.name]) {
                assets.market.sell[resource.name] = { resource, automated: true };
            }

            const offer = assets.market.sell[resource.name];
            offer.resource = resource;
            offer.offerRetainment = reserved;

            const initialPrice = planet.marketPrices[resource.name];
            const costFloor = planet.lastProductionCostFloors[resource.name];

            if (costFloor !== undefined && costFloor < PRICE_FLOOR) {
                console.warn(
                    `Cost floor for resource ${resource.name} on planet ${planet.id} is below PRICE_FLOOR (${costFloor}). ` +
                        `This may lead to unstable pricing. Clamping to PRICE_FLOOR.`,
                );
            }

            const baseRate = productionRate.get(resource.name) ?? 0;
            adjustOfferPrice(offer, inventoryQty, initialPrice, costFloor, baseRate);
        }
    }

    for (const [resourceName, offer] of Object.entries(assets.market.sell)) {
        if (!offer.automated) {
            continue;
        }
        const baseRate = productionRate.get(resourceName);
        if (baseRate !== undefined) {
            continue;
        }
        const inventoryQty = queryStorageFacility(assets.storageFacility, resourceName);
        const initialPrice = planet.marketPrices[resourceName] ?? initialMarketPrices[resourceName] ?? PRICE_FLOOR;

        const costFloor = planet.lastProductionCostFloors[resourceName];

        if (costFloor !== undefined && costFloor < PRICE_FLOOR) {
            console.warn(
                `Cost floor for resource ${resourceName} on planet ${planet.id} is below PRICE_FLOOR (${costFloor}). ` +
                    `This may lead to unstable pricing. Clamping to PRICE_FLOOR.`,
            );
        }

        offer.offerRetainment = 0;
        adjustOfferPrice(offer, inventoryQty, initialPrice, costFloor, 0);
    }

    // ── Buy-side aggregated targets ─────────────────────────────────────────
    const aggregatedBuyTargets = new Map<string, { resource: Resource; storageTarget: number; freeTarget: number }>();

    for (const facility of [
        ...assets.productionFacilities,
        ...assets.managementFacilities,
        ...assets.shipConstructionFacilities,
    ]) {
        if (facility.construction === null || facility.construction.type === 'expansion') {
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

                const bidCfg = resolveBidConfigForResource(assets, resource);
                const facilityTarget = quantity * facility.scale * bidCfg.inputBufferTargetTicks;

                const existing = aggregatedBuyTargets.get(resource.name);
                if (existing) {
                    existing.storageTarget += facilityTarget;
                } else {
                    aggregatedBuyTargets.set(resource.name, { resource, storageTarget: facilityTarget, freeTarget: 0 });
                }
            }
        }
        if (facility.construction !== null) {
            const cfg = resolveBidConfigForResource(assets, constructionServiceResourceType);
            const facilityTarget =
                facility.construction.maximumConstructionServiceConsumption * cfg.inputBufferTargetTicks;
            const existing = aggregatedBuyTargets.get(constructionServiceResourceType.name);
            if (existing) {
                existing.storageTarget += facilityTarget;
            } else {
                aggregatedBuyTargets.set(constructionServiceResourceType.name, {
                    resource: constructionServiceResourceType,
                    storageTarget: facilityTarget,
                    freeTarget: 0,
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
            const cfg = resolveBidConfigForResource(assets, constructionServiceResourceType);
            const shipTarget =
                ship.state.buildingTarget.construction.maximumConstructionServiceConsumption *
                cfg.inputBufferTargetTicks;
            const existing = aggregatedBuyTargets.get(constructionServiceResourceType.name);
            if (existing) {
                existing.storageTarget += shipTarget;
            } else {
                aggregatedBuyTargets.set(constructionServiceResourceType.name, {
                    resource: constructionServiceResourceType,
                    storageTarget: shipTarget,
                    freeTarget: 0,
                });
            }
        }

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
                    aggregatedBuyTargets.set(resource.name, { resource, storageTarget: remaining, freeTarget: 0 });
                }
            }
        }
    }

    for (const resourceName of Object.keys(assets.market.buy)) {
        const bid = assets.market.buy[resourceName];
        if (!bid.automated) continue;

        const bidCfg = resolveBidConfig(bid.autoConfig, bid.resource);
        if (bidCfg.freeBuyQuantity > 0) {
            const currentInventory = queryStorageFacility(assets.storageFacility, resourceName);
            const fillDays = Math.max(1, bidCfg.freeBuyQuantitySmoothingMaxExtra);
            const freeBuyPerTick = currentInventory < bidCfg.freeBuyQuantity ? bidCfg.freeBuyQuantity / fillDays : 0;
            const existing = aggregatedBuyTargets.get(resourceName);
            if (existing) {
                existing.freeTarget += freeBuyPerTick;
            } else {
                aggregatedBuyTargets.set(resourceName, { resource: bid.resource, storageTarget: 0, freeTarget: freeBuyPerTick });
            }
        } else if (!aggregatedBuyTargets.has(resourceName)) {
            bid.bidStorageTarget = 0;
        }
    }

    for (const [resourceName, { resource, storageTarget, freeTarget }] of aggregatedBuyTargets) {
        if (!agent.automated && assets.market.buy[resourceName]?.automated !== true) {
            continue;
        }

        if (!assets.market.buy[resourceName]) {
            assets.market.buy[resourceName] = { resource, automated: true };
        }
        const bid = assets.market.buy[resourceName];
        assert(bid.resource.name === resource.name, 'Resource mismatch in buy bid');

        const bidCfg = resolveBidConfig(bid.autoConfig, resource);

        const currentInventory = queryStorageFacility(assets.storageFacility, resourceName);

        const shortfall = Math.max(0, storageTarget - currentInventory) + freeTarget;

        const baseRateConsumption = storageTarget / bidCfg.inputBufferTargetTicks;
        let smoothedShortfall = shortfall;
        let smoothedTarget = storageTarget;
        if (
            baseRateConsumption > EPSILON &&
            storageTarget > EPSILON &&
            shortfall > EPSILON &&
            resource.form !== 'services'
        ) {
            const fillRatio = Math.min(1, currentInventory / storageTarget);
            const smoothedDemand = baseRateConsumption * (1 + bidCfg.inventorySmoothingMaxExtra * (1 - fillRatio));
            smoothedTarget = Math.min(storageTarget, currentInventory + smoothedDemand);
            smoothedShortfall = Math.max(0, smoothedTarget - currentInventory);
        }

        // Free target is always added after smoothing; smoothing only applies to structural demand
        smoothedShortfall += freeTarget;

        const marketPrice = planet.marketPrices[resourceName];
        const costFloor = planet.lastProductionCostFloors[resourceName] ?? PRICE_FLOOR;
        const bidCeil = Math.min(PRICE_CEIL, costFloor * bidCfg.bidOfferMaxCostMultiplier);
        if (bidCeil < PRICE_FLOOR) {
            console.warn(
                `Calculated bid ceiling ${bidCeil} for resource ${resourceName} on planet ${planet.id} is below PRICE_FLOOR. ` +
                    `This may lead to unstable pricing. Setting bid ceiling to PRICE_FLOOR.`,
            );
        }

        adjustBidPrice(bid, smoothedShortfall, smoothedTarget + freeTarget, marketPrice, bidCeil, costFloor);

        if (!bid.bidPrice || !isFinite(bid.bidPrice) || bid.bidPrice < PRICE_FLOOR) {
            console.warn(
                `Calculated invalid bid price ${bid.bidPrice} for agent ${agent.id} resource ${resourceName}. ` +
                    `Resetting to market price.`,
            );
            bid.bidPrice = Math.max(PRICE_FLOOR, isFinite(marketPrice) ? marketPrice : PRICE_FLOOR);
        }
    }
}

// ── Sell-side helpers ─────────────────────────────────────────────────────────

function sellThroughFactor(sellThrough: number, target: number, maxUp: number, maxDown: number): number {
    const clamped = Math.max(0, Math.min(1, sellThrough));
    if (clamped >= target) {
        const t = (clamped - target) / (1 - target);
        return 1 + t * (maxUp - 1);
    } else {
        const t = clamped / target;
        return maxDown + t * (1 - maxDown);
    }
}

export function adjustOfferPrice(
    offer: AgentMarketOfferState,
    inventoryQty: number,
    initialPrice: number,
    costFloor: number = PRICE_FLOOR,
    baseRate: number = 0,
): void {
    const cfg = resolveOfferConfig(offer.autoConfig, offer.resource);

    const sold = offer.lastSold;
    const price = offer.offerPrice;

    if (sold === undefined || price === undefined) {
        offer.offerPrice = Math.max(PRICE_FLOOR, initialPrice);
        offer.diagnostics = undefined;
        return;
    }

    // Apply sell-side inventory smoothing
    const rawRetainment = offer.offerRetainment ?? 0;
    let surplusRatio: number | undefined;
    const surplus = Math.max(0, inventoryQty - rawRetainment);
    if (surplus > EPSILON && baseRate > EPSILON && offer.resource.form !== 'services') {
        const referenceQty = baseRate * cfg.outputBufferMaxTicks;
        surplusRatio = Math.min(1, surplus / Math.max(EPSILON, referenceQty));
        const smoothedOffer = baseRate * (1 + cfg.inventorySmoothingMaxExtra * surplusRatio);
        const effectiveRetainment = Math.max(rawRetainment, inventoryQty - smoothedOffer);
        const clampedRetainment = Math.min(effectiveRetainment, inventoryQty);
        offer.offerRetainment = clampedRetainment;
    }

    const retainment = offer.offerRetainment ?? 0;
    const baseEffectiveQuantity = Math.max(0, inventoryQty - retainment);

    // Add free sell quantity to effective quantity (absolute quantity smoothed over days)
    // Convert absolute order amount to per-tick rate by dividing by fill days.
    const freeSellFillDays = Math.max(1, cfg.freeSellQuantitySmoothingMaxExtra);
    const freeSellQty = cfg.freeSellQuantity;
    const freeSellPerTick = freeSellQty > 0 && baseEffectiveQuantity < freeSellQty ? freeSellQty / freeSellFillDays : 0;
    const effectiveQuantity =
        freeSellPerTick > 0 ? Math.min(baseEffectiveQuantity + freeSellPerTick, inventoryQty) : baseEffectiveQuantity;
    const oldPrice = price;

    if (effectiveQuantity === 0) {
        if (sold > 0 && price > 0) {
            const factor = sellThroughFactor(1, cfg.targetSellThrough, cfg.priceAdjustMaxUp, cfg.priceAdjustMaxDown);
            const newPrice = price * factor;
            const clamped = Math.min(PRICE_CEIL, Math.max(PRICE_FLOOR, newPrice));
            offer.offerPrice = clamped;
            offer.diagnostics = {
                sellThroughRate: 1,
                targetSellThrough: cfg.targetSellThrough ?? 0.9,
                baseFactor: factor,
                costSpringDeviation: 0,
                overDeviation: 0,
                netFactor: factor,
                oldPrice,
                newPrice: clamped,
                costFloor,
                marketPrice: initialPrice,
                effectiveQuantity,
                rawRetainment,
            };
        } else {
            offer.diagnostics = undefined;
        }
        return;
    }

    const sellThrough = sold / effectiveQuantity;
    const factor = sellThroughFactor(sellThrough, cfg.targetSellThrough, cfg.priceAdjustMaxUp, cfg.priceAdjustMaxDown);

    const brakeZoneTop = costFloor * (1 + cfg.automatedCostFloorBuffer);

    const overPriceGuard = costFloor > PRICE_FLOOR ? costFloor * (cfg.bidOfferMaxCostMultiplier - 1) : PRICE_CEIL;

    const deviation = Math.sqrt(Math.max(0, brakeZoneTop / price - 1));
    const overDeviation = Math.sqrt(Math.max(0, price / overPriceGuard - 1));

    const netFactor = factor + cfg.costSpringStrength * deviation - cfg.costSpringStrength * overDeviation;
    const newPrice = price * netFactor;

    if (!isFinite(newPrice) || newPrice < PRICE_FLOOR) {
        offer.offerPrice = PRICE_FLOOR;
    } else {
        offer.offerPrice = Math.min(PRICE_CEIL, Math.max(PRICE_FLOOR, newPrice));
    }

    offer.diagnostics = {
        sellThroughRate: sellThrough,
        targetSellThrough: cfg.targetSellThrough ?? 0.9,
        baseFactor: factor,
        costSpringDeviation: deviation,
        overDeviation,
        netFactor,
        oldPrice,
        newPrice: offer.offerPrice,
        costFloor,
        marketPrice: initialPrice,
        effectiveQuantity,
        rawRetainment,
        surplusRatio,
    };
}

// ── Buy-side helpers ──────────────────────────────────────────────────────────

function fillRateFactor(fillRate: number, target: number, maxUp: number, maxDown: number): number {
    const clamped = Math.max(0, Math.min(1, fillRate));
    if (clamped >= target) {
        const t = (clamped - target) / (1 - target);
        return 1 + t * (maxDown - 1);
    } else {
        const t = clamped / target;
        return maxUp + t * (1 - maxUp);
    }
}

function adjustBidPrice(
    bid: AgentMarketBidState,
    shortfall: number,
    storageTarget: number,
    marketPrice: number,
    ceilingPrice: number = PRICE_CEIL,
    costFloor: number = PRICE_FLOOR,
): void {
    const cfg = resolveBidConfig(bid.autoConfig, bid.resource);
    const oldBidPrice = bid.bidPrice;

    if (shortfall > 0 && shortfall < EPSILON) {
        bid.bidStorageTarget = storageTarget - shortfall < EPSILON ? 0 : storageTarget - shortfall;

        if (bid.bidPrice === undefined || bid.bidPrice <= 0) {
            const newPrice = marketPrice;
            bid.bidPrice = Math.max(PRICE_FLOOR, newPrice);
        }
        bid.diagnostics = undefined;
        return;
    }

    bid.bidStorageTarget = storageTarget < EPSILON ? 0 : storageTarget;

    if (shortfall <= 0) {
        if (bid.bidPrice === undefined || bid.bidPrice <= 0) {
            const newPrice = marketPrice;
            bid.bidPrice = Math.max(PRICE_FLOOR, newPrice);
        }
        bid.diagnostics = undefined;
        return;
    }

    if (bid.bidPrice === undefined || bid.bidPrice <= 0) {
        bid.bidPrice = marketPrice;
        bid.bidPrice = Math.max(PRICE_FLOOR, bid.bidPrice);
        bid.diagnostics = undefined;
        return;
    }

    const lastBought = bid.lastBought ?? 0;

    const lastDemanded = bid.lastEffectiveQty ?? shortfall;
    const fillRate = lastDemanded > 0 ? lastBought / lastDemanded : 1;

    const baseFactor = fillRateFactor(fillRate, cfg.targetFillRate, cfg.priceAdjustMaxUp, cfg.priceAdjustMaxDown);

    const overDeviation = Math.sqrt(Math.max(0, bid.bidPrice / ceilingPrice - 1));
    const ceilingSpring = cfg.costSpringStrength * overDeviation;
    const factor = baseFactor - ceilingSpring;

    const newPrice = bid.bidPrice * factor;

    if (!isFinite(newPrice) || newPrice <= 0) {
        bid.bidPrice = PRICE_FLOOR;
    } else {
        bid.bidPrice = Math.max(PRICE_FLOOR, Math.min(PRICE_CEIL, newPrice));
    }

    bid.diagnostics = {
        fillRate,
        targetFillRate: cfg.targetFillRate ?? 0.9,
        baseFactor,
        ceilingPrice,
        ceilingSpring,
        netFactor: factor,
        oldBidPrice: oldBidPrice ?? bid.bidPrice,
        newBidPrice: bid.bidPrice,
        costFloor,
        marketPrice,
        shortfall,
        storageTarget,
    };
}
