import {
    AUTOMATED_COST_FLOOR_BUFFER,
    AUTOMATED_COST_FLOOR_MARKUP,
    AUTOMATED_PRICE_CAP_FACTOR,
    BID_PRICE_CAP_FACTOR,
    COST_SPRING_STRENGTH,
    EPSILON,
    IMPORT_BUFFER_TARGET_TICKS,
    INPUT_BUFFER_TARGET_TICKS,
    OUTPUT_BUFFER_MAX_TICKS,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_DOWN_SOFT,
    PRICE_ADJUST_MAX_UP,
    PRICE_CEIL,
    PRICE_FLOOR,
    SERVICE_DEPRECIATION_RATE_PER_TICK,
} from '../constants';
import { DEFAULT_WAGE_PER_EDU } from '../financial/financialTick';
import { queryStorageFacility } from '../planet/facility';
import type { Agent, AgentMarketBidState, AgentMarketOfferState, AgentPlanetAssets, Planet } from '../planet/planet';
import { constructionServiceResourceType } from '../planet/services';
import { educationLevelKeys } from '../population/education';

/**
 * Returns the set of resource names that should use IMPORT_BUFFER_TARGET_TICKS:
 * any resource that has no local producer on this planet, OR that shows chronic
 * unmet demand in the planet's smoothed market history.
 */
function buildImportDemandSet(agents: Map<string, Agent>, planet: Planet): Set<string> {
    // Collect every resource produced locally (any agent, any facility on this planet).
    const locallyProduced = new Set<string>();
    for (const agent of agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }
        for (const facility of assets.productionFacilities) {
            for (const { resource } of facility.produces) {
                locallyProduced.add(resource.name);
            }
        }
    }

    const result = new Set<string>();

    // Resources tracked in avg market results: add if no local producer or chronic shortfall.
    for (const [name, mr] of Object.entries(planet.avgMarketResult ?? {})) {
        if (!locallyProduced.has(name) || (mr.unfilledDemand ?? 0) > 0) {
            result.add(name);
        }
    }

    // Resources needed by agents but not yet in market history (new demand, no history yet).
    for (const agent of agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }
        for (const facility of assets.productionFacilities) {
            for (const { resource } of facility.needs) {
                if (
                    resource.form !== 'services' &&
                    resource.form !== 'landBoundResource' &&
                    !locallyProduced.has(resource.name)
                ) {
                    result.add(resource.name);
                }
            }
        }
        for (const facility of assets.managementFacilities) {
            for (const { resource } of facility.needs) {
                if (
                    resource.form !== 'services' &&
                    resource.form !== 'landBoundResource' &&
                    !locallyProduced.has(resource.name)
                ) {
                    result.add(resource.name);
                }
            }
        }
    }

    return result;
}

export function automaticPricing(agents: Map<string, Agent>, planet: Planet): void {
    const importDemandResources = buildImportDemandSet(agents, planet);
    agents.forEach((agent) => {
        automaticPricingForAgent(agent, planet, importDemandResources);
    });
}

function automaticPricingForAgent(agent: Agent, planet: Planet, importDemandResources: Set<string>): void {
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

    const inputReserve = new Map<string, number>();
    for (const facility of assets.productionFacilities) {
        for (const { resource, quantity } of facility.needs) {
            if (resource.form === 'landBoundResource') {
                continue;
            }
            const bufferTarget =
                resource.form === 'services'
                    ? 3
                    : importDemandResources.has(resource.name)
                      ? IMPORT_BUFFER_TARGET_TICKS
                      : INPUT_BUFFER_TARGET_TICKS;
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
                resource.form === 'services'
                    ? 3
                    : importDemandResources.has(resource.name)
                      ? IMPORT_BUFFER_TARGET_TICKS
                      : INPUT_BUFFER_TARGET_TICKS;
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
                    need.resource.form === 'services'
                        ? 3
                        : importDemandResources.has(need.resource.name)
                          ? IMPORT_BUFFER_TARGET_TICKS
                          : INPUT_BUFFER_TARGET_TICKS;
                const target = need.quantity * ratePerTick * bufferTarget;
                inputReserve.set(need.resource.name, (inputReserve.get(need.resource.name) ?? 0) + target);
            }
        }
    }

    // Pre-compute estimated cost floors for each produced resource.
    const costFloors = buildCostFloors(assets, planet, agent.id);

    const inputProfitGaps = buildInputProfitGaps(assets, planet, agent.id);

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

            const skipBrake = resource.form === 'services';
            adjustOfferPrice(
                offer,
                inventoryQty,
                initialPrice,
                costFloors.get(resource.name) ?? PRICE_FLOOR,
                skipBrake,
            );
        }
    }

    const aggregatedBuyTargets = new Map<
        string,
        { resource: (typeof assets.productionFacilities)[number]['needs'][number]['resource']; storageTarget: number }
    >();

    for (const facility of [
        ...assets.productionFacilities,
        ...assets.managementFacilities,
        ...assets.shipConstructionFacilities,
    ]) {
        if (facility.construction === null) {
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
                let outputBufferFull = false;
                if (facility.type === 'production') {
                    outputBufferFull = facility.produces.every(({ resource: out, quantity: outQty }) => {
                        const outInventory = queryStorageFacility(assets.storageFacility, out.name);
                        return outInventory >= outQty * facility.scale * OUTPUT_BUFFER_MAX_TICKS;
                    });
                }
                const bufferTarget =
                    resource.form === 'services'
                        ? 3
                        : importDemandResources.has(resource.name)
                          ? IMPORT_BUFFER_TARGET_TICKS
                          : INPUT_BUFFER_TARGET_TICKS;
                const facilityTarget = outputBufferFull ? 0 : quantity * facility.scale * bufferTarget;

                const existing = aggregatedBuyTargets.get(resource.name);
                if (existing) {
                    existing.storageTarget += facilityTarget;
                } else {
                    aggregatedBuyTargets.set(resource.name, { resource, storageTarget: facilityTarget });
                }
            }
        } else {
            // Under construction → target construction service input buffer
            const facilityTarget = facility.construction.maximumConstructionServiceConsumption * 3;
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
            const shipTarget = ship.state.buildingTarget.construction.maximumConstructionServiceConsumption * 3;
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
        bid.resource = resource;

        const currentInventory = queryStorageFacility(assets.storageFacility, resourceName);
        const shortfall = Math.max(0, storageTarget - currentInventory);

        const marketPrice = planet.marketPrices[resourceName];
        const profitGap = inputProfitGaps.get(resourceName) ?? 0;
        const bidPriceCap = isFinite(marketPrice) && marketPrice > 0 ? marketPrice * BID_PRICE_CAP_FACTOR : PRICE_CEIL;
        adjustBidPrice(bid, shortfall, storageTarget, marketPrice, profitGap, bidPriceCap);

        if (!bid.bidPrice || !isFinite(bid.bidPrice) || bid.bidPrice < PRICE_FLOOR) {
            bid.bidPrice = Math.max(PRICE_FLOOR, isFinite(marketPrice) && marketPrice > 0 ? marketPrice : PRICE_FLOOR);
        }
    }
}

function getLandBoundCostPerUnit(planet: Planet, agentId: string, resourceName: string): number {
    const entries = planet.resources[resourceName];
    if (!entries) {
        return 0;
    }
    let totalCost = 0;
    let totalUnits = 0;
    for (const entry of entries) {
        if (entry.tenantAgentId !== agentId) {
            continue;
        }
        if (entry.regenerationRate > 0) {
            // Renewable: pay costPerTick each tick for `quantity` units
            totalCost += entry.costPerTick;
            totalUnits += entry.quantity;
        } else {
            // Non-renewable: upfront purchase of maximumCapacity units
            totalCost += entry.tenantCostInCoins;
            totalUnits += entry.maximumCapacity;
        }
    }
    return totalUnits > 0 ? totalCost / totalUnits : 0;
}

function buildCostFloors(assets: AgentPlanetAssets, planet: Planet, agentId: string): Map<string, number> {
    const accumulated = new Map<string, { totalCost: number; totalUnits: number }>();

    for (const facility of assets.productionFacilities) {
        if (facility.produces.length === 0) {
            continue;
        }

        // Input cost: Σ(price × qty × scale) for each input (land-bound resources use claim cost)
        let inputCostPerTick = 0;
        for (const { resource, quantity } of facility.needs) {
            const price =
                resource.form === 'landBoundResource'
                    ? getLandBoundCostPerUnit(planet, agentId, resource.name)
                    : planet.marketPrices[resource.name];
            inputCostPerTick += price * quantity * facility.scale;
        }

        // Wage cost: Σ(wage × workerRequirement × scale) per education level
        let wageCostPerTick = 0;
        for (const edu of educationLevelKeys) {
            const req = facility.workerRequirement[edu] ?? 0;
            if (req <= 0) {
                continue;
            }
            const wage = planet.wagePerEdu?.[edu] ?? DEFAULT_WAGE_PER_EDU;
            wageCostPerTick += wage * req * facility.scale;
        }

        const totalCostPerTick = inputCostPerTick + wageCostPerTick;

        // Value-weighted output cost split
        let totalOutputValue = 0;
        for (const { resource: out, quantity } of facility.produces) {
            const price = planet.marketPrices[out.name];
            totalOutputValue += price * quantity * facility.scale;
        }

        for (const { resource: out, quantity } of facility.produces) {
            const outPrice = planet.marketPrices[out.name];
            const costShare =
                totalOutputValue > 0
                    ? (outPrice * quantity * facility.scale) / totalOutputValue
                    : 1 / facility.produces.length;
            const costForOutput = totalCostPerTick * costShare;

            const existing = accumulated.get(out.name);
            if (existing) {
                existing.totalCost += costForOutput;
                existing.totalUnits += quantity * facility.scale;
            } else {
                accumulated.set(out.name, {
                    totalCost: costForOutput,
                    totalUnits: quantity * facility.scale,
                });
            }
        }
    }

    const costFloors = new Map<string, number>();
    for (const [name, { totalCost, totalUnits }] of accumulated) {
        if (totalUnits <= 0) {
            costFloors.set(name, PRICE_FLOOR);
        } else {
            const costPerUnit = totalCost / totalUnits;
            costFloors.set(name, Math.max(PRICE_FLOOR, costPerUnit * (1 + AUTOMATED_COST_FLOOR_MARKUP)));
        }
    }
    return costFloors;
}

function buildInputProfitGaps(assets: AgentPlanetAssets, planet: Planet, agentId: string): Map<string, number> {
    const weightedGapSum = new Map<string, number>();
    const weightSum = new Map<string, number>();

    for (const facility of assets.productionFacilities) {
        if (facility.produces.length === 0) {
            continue;
        }

        let outputRevenue = 0;
        for (const { resource: out, quantity } of facility.produces) {
            const p = planet.marketPrices[out.name];
            outputRevenue += p * quantity * facility.scale;
        }
        if (outputRevenue <= 0) {
            continue;
        }

        let totalCost = 0;
        for (const { resource, quantity } of facility.needs) {
            const p =
                resource.form === 'landBoundResource'
                    ? getLandBoundCostPerUnit(planet, agentId, resource.name)
                    : planet.marketPrices[resource.name];
            totalCost += p * quantity * facility.scale;
        }
        for (const edu of educationLevelKeys) {
            const req = facility.workerRequirement[edu] ?? 0;
            if (req <= 0) {
                continue;
            }
            const wage = planet.wagePerEdu?.[edu] ?? DEFAULT_WAGE_PER_EDU;
            totalCost += wage * req * facility.scale;
        }

        const gap = Math.max(0, totalCost / outputRevenue - 1);
        if (gap === 0) {
            continue; // profitable — spring is off
        }

        for (const { resource, quantity } of facility.needs) {
            const w = quantity * facility.scale;
            weightedGapSum.set(resource.name, (weightedGapSum.get(resource.name) ?? 0) + gap * w);
            weightSum.set(resource.name, (weightSum.get(resource.name) ?? 0) + w);
        }
    }

    const result = new Map<string, number>();
    for (const [name, wgs] of weightedGapSum) {
        const wt = weightSum.get(name) ?? 1;
        result.set(name, wt > 0 ? wgs / wt : 0);
    }
    return result;
}

// ---------------------------------------------------------------------------
// Tâtonnement price adjustment helpers
// ---------------------------------------------------------------------------

const TARGET_SELL_THROUGH = 0.9;
const SERVICE_SELL_THROUGH_TARGET = 0.98;

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

function adjustOfferPrice(
    offer: AgentMarketOfferState,
    inventoryQty: number,
    initialPrice: number,
    costFloor: number = PRICE_FLOOR,
    skipCostBrake: boolean = false,
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
    let factor = sellThroughFactor(
        sellThrough,
        offer.resource.form === 'services' ? SERVICE_SELL_THROUGH_TARGET : TARGET_SELL_THROUGH,
    );

    const brakeZoneTop =
        costFloor *
        (1 + AUTOMATED_COST_FLOOR_BUFFER) *
        (1 - (offer.resource.form === 'services' ? SERVICE_DEPRECIATION_RATE_PER_TICK : 0));
    if (!skipCostBrake && factor < 1) {
        if (price <= brakeZoneTop) {
            const t =
                brakeZoneTop > costFloor
                    ? Math.max(0, Math.min(1, (price - costFloor) / (brakeZoneTop - costFloor)))
                    : 0;
            const effectiveMaxDown =
                PRICE_ADJUST_MAX_DOWN_SOFT + t * (PRICE_ADJUST_MAX_DOWN - PRICE_ADJUST_MAX_DOWN_SOFT);
            factor = Math.max(factor, effectiveMaxDown);
        }
    }
    if (brakeZoneTop > PRICE_FLOOR && price > 0) {
        const deviation = Math.max(0, brakeZoneTop / price - 1);
        factor += COST_SPRING_STRENGTH * deviation;
    }

    if (costFloor > PRICE_FLOOR) {
        const priceCap = costFloor * AUTOMATED_PRICE_CAP_FACTOR;
        const capZoneBottom = priceCap / (1 + AUTOMATED_COST_FLOOR_BUFFER);
        if (factor > 1 && price >= capZoneBottom) {
            // Linearly dampen max upward factor from PRICE_ADJUST_MAX_UP → 1.0 as
            // price approaches priceCap.
            const t = Math.max(0, Math.min(1, (price - capZoneBottom) / (priceCap - capZoneBottom)));
            const effectiveMaxUp = PRICE_ADJUST_MAX_UP + t * (1 - PRICE_ADJUST_MAX_UP);
            factor = Math.min(factor, effectiveMaxUp);
        }
        if (price > 0) {
            // Ceiling spring: pulls price back when above the cap.
            const overshoot = Math.max(0, price / priceCap - 1);
            factor -= COST_SPRING_STRENGTH * overshoot;
        }
    }

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
    profitabilityGap: number = 0,
    priceCap: number = PRICE_CEIL,
): void {
    // Handle extremely small shortfalls - treat as no demand
    if (shortfall > 0 && shortfall < EPSILON) {
        bid.bidStorageTarget = storageTarget - shortfall; // Effectively current inventory
        // Keep existing price or initialize it from market price
        if (bid.bidPrice === undefined || bid.bidPrice <= 0) {
            const newPrice = marketPrice;
            bid.bidPrice = Math.max(PRICE_FLOOR, newPrice);
        }
        return;
    }

    bid.bidStorageTarget = storageTarget;

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

    const gapWeight = Math.min(1, fillRate / TARGET_FILL_RATE);
    let factor = fillRateFactor(fillRate) - COST_SPRING_STRENGTH * profitabilityGap * gapWeight;

    // Upper ceiling brake: symmetric to the offer-side brake.
    // Caps bid price growth during long voyages where fill rate stays at 0.
    const capZoneBottom = priceCap / (1 + AUTOMATED_COST_FLOOR_BUFFER);
    if (factor > 1 && bid.bidPrice >= capZoneBottom) {
        const t = Math.max(0, Math.min(1, (bid.bidPrice - capZoneBottom) / (priceCap - capZoneBottom)));
        const effectiveMaxUp = PRICE_ADJUST_MAX_UP + t * (1 - PRICE_ADJUST_MAX_UP);
        factor = Math.min(factor, effectiveMaxUp);
    }
    if (bid.bidPrice > 0) {
        const overshoot = Math.max(0, bid.bidPrice / priceCap - 1);
        factor -= COST_SPRING_STRENGTH * overshoot;
    }

    const newPrice = bid.bidPrice * factor;

    if (!isFinite(newPrice) || newPrice <= 0) {
        bid.bidPrice = PRICE_FLOOR;
    } else {
        bid.bidPrice = Math.max(PRICE_FLOOR, Math.min(priceCap, newPrice));
    }
}
