import assert from 'assert';
import {
    ASK_VOLUME_FLOOR_FRACTION,
    AUTOMATED_COST_FLOOR_BUFFER,
    BID_OFFER_MAX_COST_MULTIPLIER,
    BID_VOLUME_FLOOR_FRACTION,
    DEFAULT_COST_SPRING_STRENGTH,
    EPSILON,
    FILL_RATE_EMA_ALPHA,
    FREE_QUANTITY_SMOOTHING_MAX_EXTRA,
    INPUT_BUFFER_TARGET_TICKS,
    INPUT_BUFFER_TARGET_TICKS_SERVICES,
    INVENTORY_SMOOTHING_MAX_EXTRA,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_UP,
    PRICE_CEIL,
    PRICE_FLOOR,
    SELL_PRODUCTION_SMOOTHING,
    SELL_THROUGH_EMA_ALPHA,
    SPRING_NORMALIZATION,
    TARGET_FILL_RATE,
    TARGET_FILL_RATE_SERVICES,
    TARGET_SELL_THROUGH,
    TARGET_SELL_THROUGH_SERVICES,
} from '../constants';
import { initialMarketPrices } from '../initialUniverse/initialMarketPrices';
import {
    getServiceFillRateTarget,
    getServiceSellThroughTarget,
} from '../planet/automaticProductionScale/runtimeConfig';
import type { Resource } from '../planet/claims';
import { isFacilityOperating, queryStorageFacility } from '../planet/facility';
import { facilityMaintenanceRepairDeficit, facilityRestorationCapacityPerTick } from '../planet/facilityMaintenance';
import {
    getAllFacilities,
    type Agent,
    type AgentMarketBidState,
    type AgentMarketOfferState,
    type AutomatedPricingConfig,
    type Planet,
} from '../planet/planet';
import { constructionServiceResourceType, maintenanceServiceResourceType } from '../planet/services';
import { toConsumptionShipInfo } from './consumptionShipInfo';
import { computeAllConsumptionRates } from './consumptionSources';
import { buyVolumeFraction, sellVolumeFraction } from './volumeFraction';

export { buyVolumeFraction, sellVolumeFraction };

// ── Config resolvers ──────────────────────────────────────────────────────────
// Each takes an optional config + the resource (to pick service-appropriate defaults),
// and returns a fully resolved config with all fields populated.

function resolveOfferConfig(config: AutomatedPricingConfig | undefined, resource: Resource) {
    const c = config ?? {};
    return {
        priceAdjustMaxUp: c.priceAdjustMaxUp ?? PRICE_ADJUST_MAX_UP,
        priceAdjustMaxDown: c.priceAdjustMaxDown ?? PRICE_ADJUST_MAX_DOWN,
        costSpringStrength: c.costSpringStrength ?? DEFAULT_COST_SPRING_STRENGTH,
        targetSellThrough:
            c.targetSellThrough ??
            (resource.form === 'services'
                ? (getServiceSellThroughTarget() ?? TARGET_SELL_THROUGH_SERVICES)
                : TARGET_SELL_THROUGH),
        askVolumeFloorFraction: c.askVolumeFloorFraction ?? ASK_VOLUME_FLOOR_FRACTION,
        automatedCostFloorBuffer: c.automatedCostFloorBuffer ?? AUTOMATED_COST_FLOOR_BUFFER,
        freeRetainment: c.freeRetainment ?? 0,
        freeRetainmentSmoothingMaxExtra: c.freeRetainmentSmoothingMaxExtra ?? FREE_QUANTITY_SMOOTHING_MAX_EXTRA,
        sellProductionSmoothing: c.sellProductionSmoothing ?? SELL_PRODUCTION_SMOOTHING,
    };
}

function resolveBidConfig(config: AutomatedPricingConfig | undefined, resource: Resource) {
    const c = config ?? {};
    return {
        priceAdjustMaxUp: c.priceAdjustMaxUp ?? PRICE_ADJUST_MAX_UP,
        priceAdjustMaxDown: c.priceAdjustMaxDown ?? PRICE_ADJUST_MAX_DOWN,
        costSpringStrength: c.costSpringStrength ?? DEFAULT_COST_SPRING_STRENGTH,
        inventorySmoothingMaxExtra: c.inventorySmoothingMaxExtra ?? INVENTORY_SMOOTHING_MAX_EXTRA,
        inputBufferTargetTicks:
            c.inputBufferTargetTicks ??
            (resource.form === 'services' ? INPUT_BUFFER_TARGET_TICKS_SERVICES : INPUT_BUFFER_TARGET_TICKS),
        targetFillRate:
            c.targetFillRate ??
            (resource.form === 'services'
                ? (getServiceFillRateTarget() ?? TARGET_FILL_RATE_SERVICES)
                : TARGET_FILL_RATE),
        bidVolumeFloorFraction: c.bidVolumeFloorFraction ?? BID_VOLUME_FLOOR_FRACTION,
        bidOfferMaxCostMultiplier: c.bidOfferMaxCostMultiplier ?? BID_OFFER_MAX_COST_MULTIPLIER,
        freeBuyQuantity: c.freeBuyQuantity ?? 0,
        freeBuyQuantitySmoothingMaxExtra: c.freeBuyQuantitySmoothingMaxExtra ?? FREE_QUANTITY_SMOOTHING_MAX_EXTRA,
    };
}

/** Convenience: looks up the existing buy bid (if any) and resolves with that config + resource. */
function resolveBidConfigForResource(assets: import('../planet/planet').AgentPlanetAssets, resource: Resource) {
    return resolveBidConfig(assets.market.buy[resource.name]?.autoConfig, resource);
}

// ── Public API ────────────────────────────────────────────────────────────────

let maintDebugTick = 0;

export function automaticPricing(agents: Map<string, Agent>, planet: Planet): void {
    const maintDebug = process.env.MAINT_DEBUG === '1' && maintDebugTick++ % 30 === 0;
    agents.forEach((agent) => {
        automaticPricingForAgent(agent, planet, maintDebug);
    });
}

function automaticPricingForAgent(agent: Agent, planet: Planet, maintDebug: boolean): void {
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

    const consumptionRates = computeAllConsumptionRates(assets, shipsForConsumption, planet.id);

    const inputReserve = new Map<string, number>();
    for (const [resourceName, rate] of consumptionRates) {
        const resource = rate.resource;
        if (!resource) {
            console.warn(
                `automaticPricing: unknown resource "${resourceName}" in consumption rates, skipping input reserve calculation.`,
            );
            continue;
        }
        const bidCfg = resolveBidConfigForResource(assets, resource);
        const target = rate.quantity * bidCfg.inputBufferTargetTicks;
        inputReserve.set(resourceName, target);
    }

    // ── Sell-side automated offers ───────────────────────────────────────────

    const productionRate = new Map<string, number>();

    for (const facility of assets.productionFacilities) {
        for (const { resource, quantity } of facility.produces) {
            if (!agent.automated && assets.market.sell[resource.name]?.automated !== true) {
                continue;
            }

            productionRate.set(resource.name, (productionRate.get(resource.name) ?? 0) + quantity * facility.maxScale);

            const inventoryQty = queryStorageFacility(assets.storage, resource.name);
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

            adjustOfferPrice(offer, inventoryQty, initialPrice, costFloor, productionRate.get(resource.name) ?? 0);
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
        const inventoryQty = queryStorageFacility(assets.storage, resourceName);
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

    for (const facility of getAllFacilities(assets, false)) {
        if (isFacilityOperating(facility)) {
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
                    aggregatedBuyTargets.set(resource.name, {
                        resource,
                        storageTarget: facilityTarget,
                        freeTarget: 0,
                    });
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

        if (isFacilityOperating(facility)) {
            const cfg = resolveBidConfigForResource(assets, maintenanceServiceResourceType);
            const facilityTarget = facilityMaintenanceRepairDeficit(facility) * cfg.inputBufferTargetTicks;
            if (maintDebug) {
                console.log(
                    `[maintfac]\t${agent.id}\t${facility.name.replace(/ /g, '_')}\t${facility.scale}\t${facility.maxScale}\t${facility.maxMaintenance}\t${facility.maintenanceStatus}\t${facilityTarget}`,
                );
            }
            const existing = aggregatedBuyTargets.get(maintenanceServiceResourceType.name);
            if (existing) {
                existing.storageTarget += facilityTarget;
            } else {
                aggregatedBuyTargets.set(maintenanceServiceResourceType.name, {
                    resource: maintenanceServiceResourceType,
                    storageTarget: facilityTarget,
                    freeTarget: 0,
                });
            }

            if (facility.maxMaintenance < 1) {
                const restorationCfg = resolveBidConfigForResource(assets, constructionServiceResourceType);
                const restorationTarget =
                    facilityRestorationCapacityPerTick(facility) * restorationCfg.inputBufferTargetTicks;
                const restorationExisting = aggregatedBuyTargets.get(constructionServiceResourceType.name);
                if (restorationExisting) {
                    restorationExisting.storageTarget += restorationTarget;
                } else {
                    aggregatedBuyTargets.set(constructionServiceResourceType.name, {
                        resource: constructionServiceResourceType,
                        storageTarget: restorationTarget,
                        freeTarget: 0,
                    });
                }
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
                    aggregatedBuyTargets.set(resource.name, {
                        resource,
                        storageTarget: remaining,
                        freeTarget: 0,
                    });
                }
            }
        }
    }

    for (const resourceName of Object.keys(assets.market.buy)) {
        const bid = assets.market.buy[resourceName];
        if (!bid.automated) {
            continue;
        }

        const bidCfg = resolveBidConfig(bid.autoConfig, bid.resource);
        if (bidCfg.freeBuyQuantity > 0) {
            const currentInventory = queryStorageFacility(assets.storage, resourceName);
            // freeBuyQuantity is an absolute additional inventory target
            const freeBuyTarget = currentInventory < bidCfg.freeBuyQuantity ? bidCfg.freeBuyQuantity : 0;
            const existing = aggregatedBuyTargets.get(resourceName);
            if (existing) {
                existing.freeTarget += freeBuyTarget;
            } else {
                aggregatedBuyTargets.set(resourceName, {
                    resource: bid.resource,
                    storageTarget: 0,
                    freeTarget: freeBuyTarget,
                });
            }
        } else if (!aggregatedBuyTargets.has(resourceName)) {
            bid.bidStorageTarget = 0;
            bid.diagnostics = undefined;
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

        const currentInventory = queryStorageFacility(assets.storage, resourceName);

        let totalShortfall = Math.max(0, storageTarget - currentInventory);

        // implied production, proxy. brittle.
        const baseRateConsumption = storageTarget / bidCfg.inputBufferTargetTicks;
        if (baseRateConsumption > EPSILON && resource.form !== 'services') {
            totalShortfall = Math.min(totalShortfall, baseRateConsumption * (1 + bidCfg.inventorySmoothingMaxExtra));
        }

        if (freeTarget > EPSILON) {
            if (resource.form !== 'services') {
                const freeFillDays = Math.max(1, bidCfg.freeBuyQuantitySmoothingMaxExtra);
                const freeFillRate = freeTarget / freeFillDays;
                const freeInventory = Math.max(0, currentInventory - storageTarget);
                const freeRemaining = Math.max(0, freeTarget - freeInventory);
                totalShortfall += freeRemaining > 0 ? Math.min(freeRemaining, freeFillRate) : 0;
            } else {
                totalShortfall += freeTarget;
            }
        }

        const marketPrice = planet.marketPrices[resourceName];
        const costFloor = planet.lastProductionCostFloors[resourceName] ?? PRICE_FLOOR;
        const bidCeil = Math.min(PRICE_CEIL, costFloor * bidCfg.bidOfferMaxCostMultiplier);
        if (bidCeil < PRICE_FLOOR) {
            console.warn(
                `Calculated bid ceiling ${bidCeil} for resource ${resourceName} on planet ${planet.id} is below PRICE_FLOOR. ` +
                    `This may lead to unstable pricing. Setting bid ceiling to PRICE_FLOOR.`,
            );
        }

        const smoothedTarget = totalShortfall > EPSILON ? currentInventory + totalShortfall : storageTarget;

        adjustBidPrice(bid, totalShortfall, smoothedTarget, marketPrice, bidCeil, costFloor);

        if (maintDebug && resourceName === maintenanceServiceResourceType.name) {
            console.log(
                `[maintbid]\t${agent.id}\taggregated=${storageTarget}\tfree=${freeTarget}\tshortfall=${totalShortfall}\tsmoothed=${smoothedTarget}\tstoredTarget=${bid.bidStorageTarget}\tprice=${bid.bidPrice}`,
            );
        }

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

export function sellThroughFactor(
    sellThrough: number,
    target: number,
    maxUp: number,
    maxDown: number,
    smoothing: number,
): number {
    if (sellThrough <= target) {
        const t = target > 0 ? sellThrough / target : 0;
        return maxDown + t * (1 - maxDown);
    }
    const range = Math.max(EPSILON, smoothing - target);
    const t = Math.min(1, (sellThrough - target) / range);
    return 1 + t * (maxUp - 1);
}

export function adjustOfferPrice(
    offer: AgentMarketOfferState,
    inventoryQty: number,
    initialPrice: number,
    costFloor: number = PRICE_FLOOR,
    productionRate: number = 0,
): void {
    const cfg = resolveOfferConfig(offer.autoConfig, offer.resource);

    const sold = offer.lastSold;
    const price = offer.offerPrice;

    if (sold === undefined || price === undefined) {
        offer.offerPrice = Math.max(PRICE_FLOOR, initialPrice);
        offer.diagnostics = undefined;
        return;
    }

    // freeRetainment ensures the agent always keeps at least this many units in storage.
    const freeRetainment = cfg.freeRetainment;
    // Base retainment includes the input-reserve retainment already set upstream plus the floor.
    const rawRetainment = (offer.offerRetainment ?? 0) + freeRetainment;
    const surplus = Math.max(0, inventoryQty - rawRetainment);
    if (surplus > EPSILON && offer.resource.form !== 'services') {
        // Producers anchor the offer to their capacity (maxScale production), not to the current
        // operating scale or the inventory, so a facility that has contracted its scale still
        // offers its full capacity and can sell down a stockpile, while the stockpile itself
        // cannot inflate the retainment without bound. Non-producers fall back to spreading the
        // surplus over the configured smoothing days to liquidate dead stock without a dump.
        const perTick =
            productionRate > 0
                ? Math.min(surplus, productionRate * cfg.sellProductionSmoothing)
                : Math.min(surplus, Math.max(100, surplus / Math.max(1, cfg.freeRetainmentSmoothingMaxExtra)));
        const effectiveRetainment = Math.max(rawRetainment, inventoryQty - perTick);
        offer.offerRetainment = Math.min(effectiveRetainment, inventoryQty);
    }

    // freeRetainment is always a floor on the final retainment
    const retainment = Math.max(offer.offerRetainment ?? 0, freeRetainment);
    const effectiveQuantity = Math.max(0, inventoryQty - retainment);
    const oldPrice = price;
    const targetSellThrough = cfg.targetSellThrough ?? TARGET_SELL_THROUGH;
    const sellSmoothing =
        offer.resource.form === 'services'
            ? 1
            : productionRate > 0
              ? cfg.sellProductionSmoothing
              : Math.max(1, cfg.freeRetainmentSmoothingMaxExtra);

    if (effectiveQuantity < EPSILON) {
        if (sold > 0 && price > 0) {
            // Stockout: everything that could be offered was sold. This is a discrete
            // signal rather than a rate measurement, so do not smooth it.
            const rawSellThrough = 1;
            const normalizedSellThrough = rawSellThrough * sellSmoothing;
            offer.smoothedSellThrough = normalizedSellThrough;
            const factor = sellThroughFactor(
                normalizedSellThrough,
                targetSellThrough,
                cfg.priceAdjustMaxUp,
                cfg.priceAdjustMaxDown,
                sellSmoothing,
            );
            const newPrice = price * factor;
            const clamped = Math.min(PRICE_CEIL, Math.max(PRICE_FLOOR, newPrice));
            offer.offerPrice = clamped;
            offer.diagnostics = {
                sellThroughRate: rawSellThrough,
                smoothedSellThrough: normalizedSellThrough,
                targetSellThrough,
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

    offer.offerRetainment = Math.max(retainment, inventoryQty - effectiveQuantity);

    const rawSellThrough = Math.min(1, Math.max(0, sold / effectiveQuantity));
    const normalizedSellThrough = rawSellThrough * sellSmoothing;
    const smoothedSellThrough =
        offer.smoothedSellThrough === undefined
            ? normalizedSellThrough
            : SELL_THROUGH_EMA_ALPHA * normalizedSellThrough + (1 - SELL_THROUGH_EMA_ALPHA) * offer.smoothedSellThrough;
    offer.smoothedSellThrough = smoothedSellThrough;
    const factor = sellThroughFactor(
        smoothedSellThrough,
        targetSellThrough,
        cfg.priceAdjustMaxUp,
        cfg.priceAdjustMaxDown,
        sellSmoothing,
    );

    const brakeZoneTop = costFloor * cfg.automatedCostFloorBuffer;
    const deviation = Math.sqrt(Math.max(0, brakeZoneTop / price - 1));
    const netFactor = factor + cfg.costSpringStrength * SPRING_NORMALIZATION * deviation;
    const newPrice = price * netFactor;

    if (!isFinite(newPrice) || newPrice < PRICE_FLOOR) {
        offer.offerPrice = PRICE_FLOOR;
    } else {
        offer.offerPrice = Math.min(PRICE_CEIL, Math.max(PRICE_FLOOR, newPrice));
    }

    offer.diagnostics = {
        sellThroughRate: rawSellThrough,
        smoothedSellThrough,
        targetSellThrough,
        baseFactor: factor,
        costSpringDeviation: deviation,
        overDeviation: 0,
        netFactor,
        oldPrice,
        newPrice: offer.offerPrice,
        costFloor,
        marketPrice: initialPrice,
        effectiveQuantity,
        rawRetainment,
    };
}

// ── Buy-side helpers ──────────────────────────────────────────────────────────

export function fillRateFactor(
    fillRate: number,
    target: number,
    maxUp: number,
    maxDown: number,
    smoothing: number,
): number {
    if (fillRate <= target) {
        const t = target > 0 ? fillRate / target : 0;
        return maxUp + t * (1 - maxUp);
    }
    const range = Math.max(EPSILON, smoothing - target);
    const t = Math.min(1, (fillRate - target) / range);
    return 1 + t * (maxDown - 1);
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
        bid.smoothedFillRate = undefined;
        bid.notPlaced = false;
        bid.diagnostics = undefined;
        return;
    }

    bid.bidStorageTarget = storageTarget < EPSILON ? 0 : storageTarget;

    if (shortfall <= 0) {
        if (bid.bidPrice === undefined || bid.bidPrice <= 0) {
            const newPrice = marketPrice;
            bid.bidPrice = Math.max(PRICE_FLOOR, newPrice);
        }
        bid.smoothedFillRate = undefined;
        bid.notPlaced = false;
        bid.diagnostics = undefined;
        return;
    }

    if (bid.bidPrice === undefined || bid.bidPrice <= 0) {
        bid.bidPrice = marketPrice;
        bid.bidPrice = Math.max(PRICE_FLOOR, bid.bidPrice);
        bid.diagnostics = undefined;
        return;
    }

    const bidWasDropped = bid.lastEffectiveQty === 0;
    if (bidWasDropped) {
        bid.notPlaced = true;
        bid.diagnostics = undefined;
        return;
    }

    const lastBought = bid.lastBought ?? 0;

    const lastDemanded = bid.lastEffectiveQty ?? shortfall;
    const rawFillRate = Math.min(1, Math.max(0, lastBought / lastDemanded));
    bid.notPlaced = false;
    const buySmoothing = bid.resource.form === 'services' ? 1 : 1 + cfg.inventorySmoothingMaxExtra;
    const normalizedFillRate = rawFillRate * buySmoothing;
    const smoothedFillRate =
        bid.smoothedFillRate === undefined
            ? normalizedFillRate
            : FILL_RATE_EMA_ALPHA * normalizedFillRate + (1 - FILL_RATE_EMA_ALPHA) * bid.smoothedFillRate;
    bid.smoothedFillRate = smoothedFillRate;

    const baseFactor = fillRateFactor(
        smoothedFillRate,
        cfg.targetFillRate,
        cfg.priceAdjustMaxUp,
        cfg.priceAdjustMaxDown,
        buySmoothing,
    );

    const overDeviation = Math.sqrt(Math.max(0, bid.bidPrice / ceilingPrice - 1));
    const ceilingSpring = cfg.costSpringStrength * SPRING_NORMALIZATION * overDeviation;
    const factor = baseFactor - ceilingSpring;

    const newPrice = bid.bidPrice * factor;

    if (!isFinite(newPrice) || newPrice <= 0) {
        bid.bidPrice = PRICE_FLOOR;
    } else {
        bid.bidPrice = Math.max(PRICE_FLOOR, Math.min(PRICE_CEIL, newPrice));
    }

    bid.diagnostics = {
        fillRate: rawFillRate,
        smoothedFillRate,
        targetFillRate: cfg.targetFillRate ?? TARGET_FILL_RATE,
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
