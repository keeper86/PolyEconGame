import {
    AUTOMATED_COST_CEILING_FACTOR,
    COST_SPRING_STRENGTH,
    EPSILON,
    INPUT_BUFFER_TARGET_TICKS,
    OUTPUT_BUFFER_MAX_TICKS,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_UP,
    PRICE_CEIL,
    PRICE_FLOOR,
} from '../constants';
import { DEFAULT_WAGE_PER_EDU } from '../financial/financialTick';
import type { Resource } from '../planet/claims';
import type { ProductionFacility } from '../planet/facility';
import { queryStorageFacility } from '../planet/facility';
import type { Agent, AgentMarketBidState, AgentMarketOfferState, AgentPlanetAssets, Planet } from '../planet/planet';
import { ALL_FACILITY_ENTRIES } from '../planet/productionFacilities';
import { constructionServiceResourceType } from '../planet/services';
import { educationLevelKeys } from '../population/education';

// ---------------------------------------------------------------------------
// Static map from resource name → canonical producer facility template.
// Built once at module load from the facility catalogue; first producer wins
// for resources that can be made by multiple facility types.
// ---------------------------------------------------------------------------
const resourceProducerTemplates: Map<string, { facility: ProductionFacility; outputQty: number }> = (() => {
    const map = new Map<string, { facility: ProductionFacility; outputQty: number }>();
    for (const entry of ALL_FACILITY_ENTRIES) {
        const facility = entry.factory('', '') as ProductionFacility;
        for (const { resource, quantity } of facility.produces) {
            if (!map.has(resource.name)) {
                map.set(resource.name, { facility, outputQty: quantity });
            }
        }
    }
    return map;
})();

export function buildPlanetProductionCosts(planet: Planet): Map<string, number> {
    const costs = new Map<string, number>();
    for (const [resourceName, { facility, outputQty }] of resourceProducerTemplates) {
        if (outputQty <= 0) {
            continue;
        }
        let cost = 0;
        for (const need of facility.needs) {
            if (need.resource.form === 'landBoundResource') {
                continue;
            }
            cost += need.quantity * (planet.marketPrices[need.resource.name] ?? 0);
        }
        // Raw worker counts (same simplified formula as populationDemand.ts)
        for (const edu of educationLevelKeys) {
            cost += facility.workerRequirement[edu] ?? 0;
        }
        // Divide by total output qty across all outputs so the cost is split
        // proportionally — avoids inflating per-unit cost when a facility produces
        // more than one resource.
        const totalOutputQty = facility.produces.reduce((sum, p) => sum + p.quantity, 0);
        cost /= totalOutputQty;
        if (cost > 0) {
            costs.set(resourceName, cost);
        }
    }

    return costs;
}

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

    const inputReserve = new Map<string, number>();
    for (const facility of assets.productionFacilities) {
        for (const { resource, quantity } of facility.needs) {
            if (resource.form === 'landBoundResource') {
                continue;
            }
            const bufferTarget = resource.form === 'services' ? 3 : INPUT_BUFFER_TARGET_TICKS;
            const target = quantity * facility.scale * bufferTarget;
            inputReserve.set(resource.name, (inputReserve.get(resource.name) ?? 0) + target);
        }
    }
    for (const facility of assets.managementFacilities) {
        for (const { resource, quantity } of facility.needs) {
            if (resource.form === 'landBoundResource') {
                continue;
            }
            const bufferTarget = resource.form === 'services' ? 3 : INPUT_BUFFER_TARGET_TICKS;
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
                const bufferTarget = need.resource.form === 'services' ? 3 : INPUT_BUFFER_TARGET_TICKS;
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

            adjustOfferPrice(offer, inventoryQty, initialPrice, costFloors.get(resource.name) ?? PRICE_FLOOR);
        }
    }

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
                let outputBufferFull = false;
                if (facility.type === 'production') {
                    outputBufferFull = facility.produces.every(({ resource: out, quantity: outQty }) => {
                        const outInventory = queryStorageFacility(assets.storageFacility, out.name);
                        return outInventory >= outQty * facility.scale * OUTPUT_BUFFER_MAX_TICKS;
                    });
                }
                const bufferTarget = resource.form === 'services' ? 3 : INPUT_BUFFER_TARGET_TICKS;
                const facilityTarget = outputBufferFull ? 0 : quantity * facility.scale * bufferTarget;

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
        adjustBidPrice(
            bid,
            shortfall,
            storageTarget,
            marketPrice,
            profitGap,
            planet.lastMarketResult[resourceName]?.productionCost ?? 0,
        );

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

const currentAverageMarketPrice = (planet: Planet, resourceName: string): number => {
    return planet.avgMarketResult[resourceName]?.clearingPrice ?? planet.marketPrices[resourceName] ?? PRICE_FLOOR;
};

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
                    : currentAverageMarketPrice(planet, resource.name);
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
            const price = currentAverageMarketPrice(planet, out.name);
            totalOutputValue += price * quantity * facility.scale;
        }

        for (const { resource: out, quantity } of facility.produces) {
            const outPrice = currentAverageMarketPrice(planet, out.name);
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
            costFloors.set(name, Math.max(PRICE_FLOOR, costPerUnit));
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
            const p = currentAverageMarketPrice(planet, out.name);
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
                    : currentAverageMarketPrice(planet, resource.name);
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
    let factor = sellThroughFactor(
        sellThrough,
        offer.resource.form === 'services' ? SERVICE_SELL_THROUGH_TARGET : TARGET_SELL_THROUGH,
    );

    const brakeZoneTop = costFloor * (1 + AUTOMATED_COST_FLOOR_BUFFER * (offer.resource.form === 'services' ? 0.5 : 1));

    if (brakeZoneTop > PRICE_FLOOR && price > 0) {
        const deviation = Math.max(0, brakeZoneTop / price - 1);
        factor += COST_SPRING_STRENGTH * deviation;
    }

    const newPrice = price * factor;

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
    profitabilityGap: number = 0,
    productionCost: number,
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

    // Ceiling spring: push bid down if it exceeds the estimated production cost × AUTOMATED_COST_CEILING_FACTOR.
    // Mirrors the cap populationDemand.ts applies to household bids (currentProductionCost × 5 × RELATIVE_PRICE(=2) = ×10).
    if (productionCost > 0) {
        const costCeiling = productionCost * AUTOMATED_COST_CEILING_FACTOR;
        const ceilingDeviation = Math.max(0, bid.bidPrice / costCeiling - 1);
        factor -= COST_SPRING_STRENGTH * ceilingDeviation;
    }

    const newPrice = bid.bidPrice * factor;

    // Ensure price is always at least PRICE_FLOOR and not NaN/Infinity
    if (!isFinite(newPrice) || newPrice <= 0) {
        bid.bidPrice = PRICE_FLOOR;
    } else {
        bid.bidPrice = Math.max(PRICE_FLOOR, Math.min(PRICE_CEIL, newPrice));
    }
}
