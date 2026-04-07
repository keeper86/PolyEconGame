import {
    AUTOMATED_COST_FLOOR_BUFFER,
    AUTOMATED_COST_FLOOR_MARKUP,
    COST_SPRING_STRENGTH,
    EPSILON,
    INPUT_BUFFER_TARGET_TICKS,
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
    for (const facility of [...assets.productionFacilities, ...assets.managementFacilities]) {
        if (facility.construction === null) {
            continue;
        }
        const target = facility.construction.maximumConstructionServiceConsumption * INPUT_BUFFER_TARGET_TICKS;
        inputReserve.set(
            constructionServiceResourceType.name,
            (inputReserve.get(constructionServiceResourceType.name) ?? 0) + target,
        );
    }

    // Pre-compute estimated cost floors for each produced resource.
    const costFloors = buildCostFloors(assets, planet);

    const inputProfitGaps = buildInputProfitGaps(assets, planet);

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

    for (const facility of [...assets.productionFacilities, ...assets.managementFacilities]) {
        if (facility.construction === null) {
            for (const { resource, quantity } of facility.needs) {
                if (resource.form === 'landBoundResource') {
                    continue;
                }
                const bufferTarget = resource.form === 'services' ? 3 : INPUT_BUFFER_TARGET_TICKS;
                const facilityTarget = quantity * facility.scale * bufferTarget;

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

    // Remove automated buy entries that are no longer needed (e.g. construction finished)
    for (const resourceName of Object.keys(assets.market.buy)) {
        if (assets.market.buy[resourceName].automated && !aggregatedBuyTargets.has(resourceName)) {
            delete assets.market.buy[resourceName];
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
        adjustBidPrice(bid, shortfall, storageTarget, marketPrice, profitGap);

        if (!bid.bidPrice || !isFinite(bid.bidPrice) || bid.bidPrice < PRICE_FLOOR) {
            bid.bidPrice = Math.max(PRICE_FLOOR, isFinite(marketPrice) && marketPrice > 0 ? marketPrice : PRICE_FLOOR);
        }
    }
}

function buildCostFloors(assets: AgentPlanetAssets, planet: Planet): Map<string, number> {
    const accumulated = new Map<string, { totalCost: number; totalUnits: number }>();

    for (const facility of assets.productionFacilities) {
        if (facility.produces.length === 0) {
            continue;
        }

        // Input cost: Σ(marketPrice × qty × scale) for each non-land input
        let inputCostPerTick = 0;
        for (const { resource, quantity } of facility.needs) {
            if (resource.form === 'landBoundResource') {
                continue;
            }
            const price = planet.marketPrices[resource.name];
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

/**
 * For each input resource, compute a weighted-average profitability gap across
 * all facilities that consume it:
 *
 *   gap_facility = max(0, totalCost / outputRevenue − 1)
 *
 * where totalCost = Σ(inputPrice × qty × scale) + Σ(wage × workers × scale)
 * and outputRevenue = Σ(marketPrice[out] × qty × scale).
 *
 * The gap is weighted by the facility's consumption of that input (qty × scale).
 * A gap of 0.3 means the facility's costs are 30 % above its output revenue.
 *
 * Returns: input resource name → weighted-average profitability gap (≥ 0).
 * Profitable facilities (gap = 0) do not contribute to the spring.
 */
function buildInputProfitGaps(assets: AgentPlanetAssets, planet: Planet): Map<string, number> {
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
            if (resource.form === 'landBoundResource') {
                continue;
            }
            const p = planet.marketPrices[resource.name];
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
            if (resource.form === 'landBoundResource') {
                continue;
            }
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

    // Cost spring (output side): additive upward correction proportional to how far
    // the current price sits below the production cost floor.  At the floor the
    // spring is zero; it grows linearly as price falls further below.  This is the
    // error-correction term from ABM price-dynamics literature (cf. EURACE, Dosi
    // et al.): a signal coupling rising input costs to output prices.
    if (brakeZoneTop > PRICE_FLOOR && price > 0) {
        const deviation = Math.max(0, brakeZoneTop / price - 1);
        factor += COST_SPRING_STRENGTH * deviation;
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
): void {
    // Handle extremely small shortfalls - treat as no demand
    if (shortfall > 0 && shortfall < EPSILON) {
        // No meaningful demand, set storage target to current inventory level
        // This prevents creating bids with quantities that would fail validation
        bid.bidStorageTarget = storageTarget - shortfall; // Effectively current inventory
        // Keep existing price or initialize it from market price
        if (bid.bidPrice === undefined || bid.bidPrice <= 0) {
            const newPrice = marketPrice;
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
    // lastEffectiveQty is the quantity actually placed in the order book last tick
    // by collectAgentBids (after proportional deposit scaling). It is a better
    // denominator for fill-rate than the raw shortfall, which changes each tick.
    const lastDemanded = bid.lastEffectiveQty ?? shortfall;
    const fillRate = lastDemanded > 0 ? lastBought / lastDemanded : 1;

    // Cost spring (input side): subtract a correction proportional to the
    // facility profitability gap, nudging bid prices downward when the agent's
    // total production costs exceed its output revenue.  Symmetric to the
    // output-side spring: together they create a restoring force toward
    // break-even that weakens once profitability is reached.
    //
    // The gap penalty is weighted by fill rate so that it is zero when the
    // agent cannot procure inputs at all (fillRate = 0).  Without this weight,
    // a downstream processor whose output revenue is near zero (e.g. upstream
    // markets not yet settled) accumulates an enormous profitability gap that
    // overcomes the upward fill-rate signal and pins bids at PRICE_FLOOR —
    // a deadlock the market cannot resolve on its own.  As supply becomes
    // available (fillRate → TARGET_FILL_RATE) the full cost-awareness
    // gradually re-engages.
    const gapWeight = Math.min(1, fillRate / TARGET_FILL_RATE);
    const factor = fillRateFactor(fillRate) - COST_SPRING_STRENGTH * profitabilityGap * gapWeight;

    const priceCeil = PRICE_CEIL;
    const newPrice = bid.bidPrice * factor;

    // Ensure price is always at least PRICE_FLOOR and not NaN/Infinity
    if (!isFinite(newPrice) || newPrice <= 0) {
        bid.bidPrice = PRICE_FLOOR;
    } else {
        bid.bidPrice = Math.max(PRICE_FLOOR, Math.min(priceCeil, newPrice));
    }
}
