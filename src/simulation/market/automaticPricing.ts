import {
    AUTOMATED_COST_FLOOR_BUFFER,
    AUTOMATED_COST_FLOOR_MARKUP,
    COST_SPRING_STRENGTH,
    EPSILON,
    INPUT_BUFFER_TARGET_TICKS,
    OUTPUT_BUFFER_MAX_TICKS,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_DOWN_SOFT,
    PRICE_ADJUST_MAX_UP,
    PRICE_CEIL,
    PRICE_FLOOR,
    SERVICE_DEPRECIATION_RATE_PER_TICK,
    TICKS_PER_MONTH,
} from '../constants';
import { DEFAULT_WAGE_PER_EDU } from '../financial/financialTick';
import { queryStorageFacility } from '../planet/facility';
import type { Agent, AgentMarketBidState, AgentMarketOfferState, AgentPlanetAssets, Planet } from '../planet/planet';
import { constructionServiceResourceType } from '../planet/services';
import { educationLevelKeys } from '../population/education';
import {
    DEFAULT_EXCHANGE_RATE,
    FOREX_PRICE_FLOOR,
    getCurrencyResource,
    getCurrencyResourceName,
} from './currencyResources';

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
        ...assets.shipMaintenanceFacilities,
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
        ...assets.shipMaintenanceFacilities,
        ...assets.managementFacilities,
        ...assets.shipConstructionFacilities,
    ]) {
        if (facility.construction === null) {
            const needs =
                facility.type === 'ship_construction' ? (facility.produces?.buildingCost ?? []) : facility.needs;
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
        adjustBidPrice(bid, shortfall, storageTarget, marketPrice, profitGap);

        if (!bid.bidPrice || !isFinite(bid.bidPrice) || bid.bidPrice < PRICE_FLOOR) {
            bid.bidPrice = Math.max(PRICE_FLOOR, isFinite(marketPrice) && marketPrice > 0 ? marketPrice : PRICE_FLOOR);
        }
    }

    // --- Forex pricing: buy/sell orders for foreign currencies ---
    if (agent.automated) {
        automaticForexPricing(agent, assets, planet);
    }
}

// ---------------------------------------------------------------------------
// Forex pricing helpers
// ---------------------------------------------------------------------------

/** How many ticks of foreign-planet operating costs an agent wants to hold as foreign-currency buffer. */
const FOREX_BUFFER_TICKS = 30;
/** Maximum urgency premium on bid price (fraction). */
const FOREX_URGENCY_MAX = 0.3;
/** Maximum random noise range on forex prices (fraction, applied symmetrically). */
const FOREX_NOISE_RANGE = 0.05;

/**
 * Returns a deterministic seed in [0, 1) derived from the agent’s id.
 * Used to add reproducible per-agent heterogeneity to forex pricing without
 * storing extra state.
 */
export function getAgentDeterministicSeed(agent: Agent): number {
    // FNV-1a 32-bit hash
    let h = 0x811c9dc5;
    for (let i = 0; i < agent.id.length; i++) {
        h ^= agent.id.charCodeAt(i);
        h = (Math.imul(h, 0x01000193) | 0) >>> 0;
    }
    return h / 0xffffffff;
}

/**
 * Estimate how many units of `foreignPlanetId`’s currency the agent needs
 * as a working-capital buffer, based on last month’s wages + purchases there.
 */
function computeForexBufferTarget(agent: Agent, foreignPlanetId: string): number {
    const fa = agent.assets[foreignPlanetId];
    if (!fa) {
        return 0;
    }
    const perTick = (fa.lastMonthAcc.wages + fa.lastMonthAcc.purchases) / TICKS_PER_MONTH;
    return perTick * FOREX_BUFFER_TICKS;
}

/** Adjust the ask price for a forex sell order using tâtonnement + noise. */
function adjustForexAskPrice(offer: AgentMarketOfferState, lastExchangeRate: number, seed: number): void {
    if (offer.offerPrice === undefined) {
        offer.offerPrice = Math.max(FOREX_PRICE_FLOOR, lastExchangeRate);
        return;
    }
    const sold = offer.lastSold ?? 0;
    const placed = offer.lastPlacedQty ?? 0;
    const st = placed > 0 ? sold / placed : 1;
    const base = sellThroughFactor(st) * offer.offerPrice;
    // Per-agent noise centred slightly above zero so prices don’t collapse
    const noise = (seed - 0.4) * FOREX_NOISE_RANGE;
    offer.offerPrice = Math.max(FOREX_PRICE_FLOOR, Math.min(PRICE_CEIL, base * (1 + noise)));
}

/** Adjust the bid price for a forex buy order using fill-rate + urgency. */
function adjustForexBidPrice(bid: AgentMarketBidState, lastExchangeRate: number, urgency: number, seed: number): void {
    if (bid.bidPrice === undefined || bid.bidPrice <= 0) {
        bid.bidPrice = Math.max(FOREX_PRICE_FLOOR, lastExchangeRate);
        return;
    }
    const bought = bid.lastBought ?? 0;
    const demanded = bid.lastEffectiveQty ?? 1;
    const fillRate = demanded > 0 ? bought / demanded : 1;
    const baseFactor = fillRateFactor(fillRate);
    const urgencyPremium = urgency * FOREX_URGENCY_MAX;
    // Slight upward noise bias so bids don’t stall at min price when idle
    const noise = (seed - 0.3) * FOREX_NOISE_RANGE;
    const newPrice = bid.bidPrice * baseFactor * (1 + urgencyPremium + noise);
    bid.bidPrice = Math.max(FOREX_PRICE_FLOOR, Math.min(PRICE_CEIL, newPrice));
}

/**
 * Initialise and update forex market entries for all foreign currencies
 * the automated agent needs to sell (surplus) or buy (shortfall).
 *
 * Currency entries sit in the same `assets.market.sell / buy` maps as
 * physical goods, but are handled exclusively by `forexTick` — the local
 * `marketTick` skips resources with `form === 'currency'`.
 */
function automaticForexPricing(agent: Agent, assets: AgentPlanetAssets, planet: Planet): void {
    if (!assets.market) {
        return;
    }
    const seed = getAgentDeterministicSeed(agent);

    // SELL orders — offer surplus foreign-currency holdings
    for (const [foreignPlanetId, foreignAssets] of Object.entries(agent.assets)) {
        if (foreignPlanetId === planet.id) {
            continue;
        }
        const balance = foreignAssets.deposits;
        if (!(balance > 0)) {
            continue;
        }
        const curName = getCurrencyResourceName(foreignPlanetId);
        const curResource = getCurrencyResource(foreignPlanetId);
        const lastRate = (planet.marketPrices as Record<string, number>)[curName] ?? DEFAULT_EXCHANGE_RATE;
        const bufferTarget = computeForexBufferTarget(agent, foreignPlanetId);
        const holds = agent.assets[foreignPlanetId]?.depositHold ?? 0;
        const surplus = balance - holds - bufferTarget;

        if (!assets.market.sell[curName]) {
            assets.market.sell[curName] = { resource: curResource, automated: true };
        }
        const offer = assets.market.sell[curName];
        offer.resource = curResource;

        if (surplus > 0) {
            // Retain the buffer; offer only the surplus
            offer.offerRetainment = balance - surplus;
            adjustForexAskPrice(offer, lastRate, seed);
        } else {
            // Nothing to sell; keep entry but lock full balance as retainment
            offer.offerRetainment = balance;
            if (offer.offerPrice === undefined) {
                offer.offerPrice = Math.max(FOREX_PRICE_FLOOR, lastRate);
            }
        }
    }

    // BUY orders — bid for currencies needed on foreign planets the agent operates on
    for (const foreignPlanetId of Object.keys(agent.assets)) {
        if (foreignPlanetId === planet.id) {
            continue;
        }
        const bufferTarget = computeForexBufferTarget(agent, foreignPlanetId);
        if (bufferTarget <= 0) {
            continue;
        }
        const curName = getCurrencyResourceName(foreignPlanetId);
        const curResource = getCurrencyResource(foreignPlanetId);
        const lastRate = (planet.marketPrices as Record<string, number>)[curName] ?? DEFAULT_EXCHANGE_RATE;
        const current = agent.assets[foreignPlanetId]?.deposits ?? 0;
        const shortfall = Math.max(0, bufferTarget - current);
        const urgency = bufferTarget > 0 ? Math.min(1, shortfall / bufferTarget) : 0;

        if (!assets.market.buy[curName]) {
            assets.market.buy[curName] = { resource: curResource, automated: true };
        }
        const bid = assets.market.buy[curName];
        bid.resource = curResource;
        // bidStorageTarget here means “desired foreign deposit amount” (in foreign-currency units),
        // read by forexOrderCollection to determine how much to bid.
        bid.bidStorageTarget = bufferTarget;
        adjustForexBidPrice(bid, lastRate, urgency, seed);
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
