// ── Types ────────────────────────────────────────────────────────────────────

export type PidParams = {
    kp: number;
    ki: number;
    kd: number;
    iMax: number;
    outMax: number;
    dAlpha: number;
};

export type PricingParams = {
    priceAdjustMaxUp: number;
    priceAdjustMaxDown: number;
    costSpringStrength: number;
    targetSellThrough: number;
    automatedCostFloorBuffer: number;
    bidOfferMaxCostMultiplier: number;
    outputBufferTicks: number;
    inputBufferTargetTicks: number;
    /** If true, outputBufferTicks only affects signal (overfill penalty), not retainment */
    overfillOnly?: boolean;
    /** If true, cap offered quantity by recent sales + current production */
    sellSmoothing?: boolean;
    /** If false, use raw input shortfall (no buy-side smoothing cap) */
    buySmoothing?: boolean;
};

export const PID_DEFAULTS: PidParams = {
    kp: 0.033,
    ki: 0.001,
    kd: 0.01,
    iMax: 0.025,
    outMax: 0.033,
    dAlpha: 0.3,
};

export const PRICING_DEFAULTS: PricingParams = {
    priceAdjustMaxUp: 1.05,
    priceAdjustMaxDown: 0.95,
    costSpringStrength: 0.1,
    targetSellThrough: 0.9,
    automatedCostFloorBuffer: 1.5,
    bidOfferMaxCostMultiplier: 6,
    outputBufferTicks: 0,
    inputBufferTargetTicks: 30,
    overfillOnly: false,
    sellSmoothing: false,
    buySmoothing: true,
};

export type DemandModel =
    | { type: 'constant'; demandPerTick: number }
    | { type: 'step'; initial: number; afterTick: number; newValue: number }
    | { type: 'sine'; mean: number; amplitude: number; periodTicks: number };

export interface ChainNodeConfig {
    name: string;
    id: string;
    costFloor: number;
    maxScale: number;
    initialScale: number;
    outputPerScalePerTick: number;
    inputPerScalePerTick: number;
    inputResource: string | null; // null = no input (raw producer)
    outputResource: string;
    hasPopulationDemand?: boolean; // if true, this node's output is consumed by population
}

export interface NodeStateSnapshot {
    tick: number;
    nodeId: string;
    scale: number;
    inventory: number;
    price: number;
    sold: number;
    bought: number;
    signal: number;
    unfilledDemand: number;
    unsoldSupply: number;
    totalDemand: number;
    totalSupply: number;
}

export interface SimSnapshot {
    tick: number;
    nodes: Record<string, NodeStateSnapshot>;
    /** Population count (only meaningful when population feedback is active) */
    population?: number;
    /** Food consumed by population this tick */
    foodConsumed?: number;
    /** Food needed by population this tick */
    foodNeeded?: number;
}

export interface ChainSimConfig {
    nodes: ChainNodeConfig[];
    pid: PidParams;
    pricing: PricingParams;
    demand: DemandModel;
    numTicks: number;
    scaleOverride?: Record<string, number>; // nodeId → multiplier (default 1.0)
    // Population feedback
    population?: number;
    foodPerCapita?: number;
}

// ── Default chain configuration ──────────────────────────────────────────────

export const DEFAULT_CHAIN_CONFIG: ChainNodeConfig[] = [
    {
        name: 'Mine',
        id: 'mine',
        costFloor: 10,
        maxScale: 200,
        initialScale: 100,
        outputPerScalePerTick: 1,
        inputPerScalePerTick: 0,
        inputResource: null,
        outputResource: 'ore',
    },
    {
        name: 'Smelter',
        id: 'smelter',
        costFloor: 25,
        maxScale: 120,
        initialScale: 60,
        outputPerScalePerTick: 1,
        inputPerScalePerTick: 2, // 2 ore → 1 ingot
        inputResource: 'ore',
        outputResource: 'ingot',
    },
    {
        name: 'Factory',
        id: 'factory',
        costFloor: 50,
        maxScale: 80,
        initialScale: 40,
        outputPerScalePerTick: 1,
        inputPerScalePerTick: 2, // 2 ingot → 1 widget
        inputResource: 'ingot',
        outputResource: 'widget',
        hasPopulationDemand: true,
    },
];

// ── Constants from real game ─────────────────────────────────────────────────

export const INVENTORY_SMOOTHING_MAX_EXTRA = 2;
export const SELL_SMOOTHING_HEADROOM = 1.0;
export const POP_GROWTH_RATE = 0.0005;
export const POP_DECLINE_RATE = 0.002;

// ── PID controller (extracted from automaticProductionScale.ts) ──────────────

interface PidState {
    integral: number;
    prevError: number;
    filteredError: number;
    expansionIntegral: number;
    contractionIntegral: number;
}

function defaultPidState(): PidState {
    return { integral: 0, prevError: 0, filteredError: 0, expansionIntegral: 0, contractionIntegral: 0 };
}

function computeFacilitySignal(
    inventory: number,
    perTick: number,
    totalDemand: number,
    totalSupply: number,
    unfilledDemand: number,
    unsoldSupply: number,
    price: number,
    _outputBufferTicks: number,
): number {
    const unfilledFrac = totalDemand > 0 ? unfilledDemand / totalDemand : 0;
    const rawUnsoldFrac = totalSupply > 0 ? unsoldSupply / totalSupply : 0;
    // Saturate unsoldFrac: once more than 50% of offered goods are unsold,
    // additional oversupply has diminishing signal impact.
    // This prevents a 100x inventory dump from creating an extreme signal spike.
    const unsoldFrac = rawUnsoldFrac / (rawUnsoldFrac + 0.5);
    const balance = (unfilledDemand - unsoldSupply) / Math.max(1, unfilledDemand + unsoldSupply);

    const WEIGHT_UNFILLED = 1.0;
    const WEIGHT_UNSOLD = 0.5;
    const WEIGHT_BALANCE = 2.0;

    const weightedSum =
        price * (WEIGHT_UNFILLED * unfilledFrac - WEIGHT_UNSOLD * unsoldFrac + WEIGHT_BALANCE * balance);
    const totalWeight = price * (WEIGHT_UNFILLED + WEIGHT_UNSOLD + WEIGHT_BALANCE);

    if (totalWeight === 0) {
        return 0;
    }

    return Math.max(-1, Math.min(1, weightedSum / totalWeight));
}

function computePidDelta(signal: number, state: PidState, params: PidParams): number {
    const EPSILON = 1e-4;

    state.filteredError = params.dAlpha * signal + (1 - params.dAlpha) * state.filteredError;

    const P = params.kp * signal;
    const D = params.kd * (state.filteredError - state.prevError);
    state.prevError = state.filteredError;

    if (signal > 0 && state.integral < 0) {
        state.integral = 0;
    }

    if (Math.abs(signal) < EPSILON) {
        state.integral *= 0.5;
    }

    const tentativeOutput = P + state.integral + D;
    const outSat = Math.max(-params.outMax, Math.min(params.outMax, tentativeOutput));
    const saturated = Math.abs(outSat) >= params.outMax;
    const errorSameDirection = (signal > 0 && outSat > 0) || (signal < 0 && outSat < 0);
    if (!saturated || !errorSameDirection) {
        state.integral = Math.max(-params.iMax, Math.min(params.iMax, state.integral + params.ki * signal));
    }

    return Math.max(-params.outMax, Math.min(params.outMax, P + state.integral + D));
}

// ── Pricing (extracted from automaticPricing.ts) ─────────────────────────────

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

function computeOfferPrice(
    inventory: number,
    lastSold: number,
    currentPrice: number,
    initialPrice: number,
    costFloor: number,
    baseRate: number,
    params: PricingParams,
    outputBufferTicks: number,
): number {
    const PRICE_FLOOR = 0.01;
    const PRICE_CEIL = 1000000.0;

    if (currentPrice <= 0) {
        return Math.max(PRICE_FLOOR, initialPrice);
    }

    // Output buffer retainment (simplified: just keep outputBufferTicks worth off market)
    const retainment = !params.overfillOnly && outputBufferTicks > 0 ? baseRate * outputBufferTicks : 0;
    const effectiveQuantity = Math.max(0, inventory - retainment);

    if (effectiveQuantity === 0) {
        if (lastSold > 0 && currentPrice > 0) {
            const factor = sellThroughFactor(
                1,
                params.targetSellThrough,
                params.priceAdjustMaxUp,
                params.priceAdjustMaxDown,
            );
            return Math.min(PRICE_CEIL, Math.max(PRICE_FLOOR, currentPrice * factor));
        }
        return currentPrice;
    }

    const sellThrough = effectiveQuantity > 0 ? lastSold / effectiveQuantity : 1;
    const factor = sellThroughFactor(
        sellThrough,
        params.targetSellThrough,
        params.priceAdjustMaxUp,
        params.priceAdjustMaxDown,
    );

    const brakeZoneTop = costFloor * params.automatedCostFloorBuffer;
    const deviation = Math.sqrt(Math.max(0, brakeZoneTop / currentPrice - 1));
    const netFactor = factor + params.costSpringStrength * deviation;
    const newPrice = currentPrice * netFactor;

    return Math.min(PRICE_CEIL, Math.max(PRICE_FLOOR, newPrice));
}

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

function computeBidPrice(
    shortfall: number,
    storageTarget: number,
    marketPrice: number,
    ceilingPrice: number,
    costFloor: number,
    lastBought: number,
    lastDemanded: number,
    currentBidPrice: number | undefined,
    params: PricingParams,
): number {
    const PRICE_FLOOR = 0.01;
    const PRICE_CEIL = 1000000.0;

    if (shortfall <= 1e-4) {
        return currentBidPrice ?? Math.max(PRICE_FLOOR, marketPrice);
    }

    if (currentBidPrice === undefined || currentBidPrice <= 0) {
        return Math.max(PRICE_FLOOR, marketPrice);
    }

    const effectiveDemanded = lastDemanded > 0 ? lastDemanded : shortfall;
    const fillRate = effectiveDemanded > 0 ? lastBought / effectiveDemanded : 1;
    const baseFactor = fillRateFactor(
        fillRate,
        params.targetSellThrough,
        params.priceAdjustMaxUp,
        params.priceAdjustMaxDown,
    );

    const overDeviation = Math.sqrt(Math.max(0, currentBidPrice / ceilingPrice - 1));
    const ceilingSpring = params.costSpringStrength * overDeviation;
    const factor = baseFactor - ceilingSpring;
    const newPrice = currentBidPrice * factor;

    return Math.max(PRICE_FLOOR, Math.min(PRICE_CEIL, newPrice));
}

// ── Demand simulation ────────────────────────────────────────────────────────

function simulateDemand(model: DemandModel, tick: number): number {
    switch (model.type) {
        case 'constant':
            return model.demandPerTick;
        case 'step':
            return tick < model.afterTick ? model.initial : model.newValue;
        case 'sine': {
            const phase = (2 * Math.PI * tick) / model.periodTicks;
            return Math.max(0, model.mean + model.amplitude * Math.sin(phase));
        }
    }
}

// ── Main simulator ───────────────────────────────────────────────────────────

interface NodeRuntime {
    config: ChainNodeConfig;
    scale: number;
    inventory: number; // output storage
    inputInventory: number; // storage of input resource (from upstream)
    price: number; // offer price for output
    bidPrice: number; // bid price for input
    lastSold: number;
    lastBought: number;
    lastDemanded: number;
    pidState: PidState;
    signal: number;
}

function initialPriceForResource(resourceName: string, nodes: ChainNodeConfig[]): number {
    for (const n of nodes) {
        if (n.outputResource === resourceName) {
            return n.costFloor * 1.5;
        }
    }
    return 100;
}

function shouldRetain(pricingParams: PricingParams): boolean {
    return !pricingParams.overfillOnly && pricingParams.outputBufferTicks > 0;
}

export function runChainSimulation(config: ChainSimConfig): SimSnapshot[] {
    const { nodes: nodeConfigs, pid: pidParams, pricing: pricingParams, numTicks } = config;
    const results: SimSnapshot[] = [];

    // Population state
    let population = config.population ?? 0;
    const foodPerCapita = config.foodPerCapita ?? 0;

    // Initialize runtime state per node
    const scaleOverride = config.scaleOverride ?? {};
    const runtimes = new Map<string, NodeRuntime>();
    for (const nc of nodeConfigs) {
        const scaleMult = scaleOverride[nc.id] ?? 1;
        const effectiveScale = Math.min(nc.maxScale, nc.initialScale * scaleMult);
        runtimes.set(nc.id, {
            config: nc,
            scale: effectiveScale,
            inventory: nc.outputPerScalePerTick * effectiveScale * 10, // seed with 10 ticks of output
            inputInventory: nc.inputResource ? nc.outputPerScalePerTick * effectiveScale * 10 : 0,
            price: initialPriceForResource(nc.outputResource, nodeConfigs),
            bidPrice: nc.inputResource ? initialPriceForResource(nc.inputResource, nodeConfigs) * 0.8 : 0,
            lastSold: nc.outputPerScalePerTick * nc.initialScale,
            lastBought: nc.inputResource ? nc.inputPerScalePerTick * nc.initialScale : 0,
            lastDemanded: nc.inputResource ? nc.inputPerScalePerTick * nc.initialScale : 0,
            pidState: defaultPidState(),
            signal: 0,
        });
    }

    // Track market state per resource
    const marketPrices = new Map<string, number>();
    for (const nc of nodeConfigs) {
        if (!marketPrices.has(nc.outputResource)) {
            marketPrices.set(nc.outputResource, initialPriceForResource(nc.outputResource, nodeConfigs));
        }
        if (nc.inputResource && !marketPrices.has(nc.inputResource)) {
            marketPrices.set(nc.inputResource, initialPriceForResource(nc.inputResource, nodeConfigs));
        }
    }

    for (let tick = 0; tick < numTicks; tick++) {
        // ── Step 0: Compute population demand ──
        let popDemand = simulateDemand(config.demand, tick);
        if (population > 0 && foodPerCapita > 0) {
            popDemand = population * foodPerCapita;
        }

        // ── Step 1: Collect supply and demand per resource ──
        const supplyPerResource = new Map<string, number>();
        const demandPerResource = new Map<string, number>();
        const retain = shouldRetain(pricingParams);

        for (const [_id, rt] of runtimes) {
            // Supply = what this node offers for sale (output)
            const retainment = retain
                ? rt.config.outputPerScalePerTick * rt.scale * pricingParams.outputBufferTicks
                : 0;
            const surplus = Math.max(0, rt.inventory - retainment);

            // Sell-side smoothing: cap offered quantity by recent sales + current production
            let offered = surplus;
            if (pricingParams.sellSmoothing && surplus > 0) {
                const perTick = rt.config.outputPerScalePerTick * rt.scale;
                const smoothedMax = rt.lastSold * (1 + SELL_SMOOTHING_HEADROOM) + perTick;
                offered = Math.min(surplus, Math.max(0, smoothedMax));
            }

            supplyPerResource.set(
                rt.config.outputResource,
                (supplyPerResource.get(rt.config.outputResource) ?? 0) + offered,
            );

            // Demand = what this node wants to buy (input)
            if (rt.config.inputResource) {
                const baseRate = rt.config.inputPerScalePerTick * rt.scale;
                const inputTarget = baseRate * pricingParams.inputBufferTargetTicks;
                const currentInput = rt.inputInventory;
                const rawShortfall = Math.max(0, inputTarget - currentInput);

                let shortfall = rawShortfall;
                if (pricingParams.buySmoothing) {
                    // Real-game buy-side smoothing: cap stock demand spike
                    const fillRatio = inputTarget > 0 ? Math.min(1, currentInput / inputTarget) : 0;
                    const cappedDemand = baseRate * (1 + INVENTORY_SMOOTHING_MAX_EXTRA * (1 - fillRatio));
                    shortfall = Math.min(rawShortfall, cappedDemand);
                }

                demandPerResource.set(
                    rt.config.inputResource,
                    (demandPerResource.get(rt.config.inputResource) ?? 0) + shortfall,
                );
            }
        }

        // Population demand for the final good
        const finalNode = nodeConfigs.find((n) => n.hasPopulationDemand);
        if (finalNode) {
            demandPerResource.set(
                finalNode.outputResource,
                (demandPerResource.get(finalNode.outputResource) ?? 0) + popDemand,
            );
        }

        // ── Step 2: Clear markets (per resource) ──
        const clearedPrices = new Map<string, number>();
        const clearedUnfilled = new Map<string, number>();
        const clearedUnsold = new Map<string, number>();
        const clearedVolume = new Map<string, number>();

        for (const [resName, totalSupply] of supplyPerResource) {
            const totalDemand = demandPerResource.get(resName) ?? 0;
            const currentPrice = marketPrices.get(resName) ?? initialPriceForResource(resName, nodeConfigs);

            let clearingPrice: number;
            let volume: number;
            let unsold: number;
            let unfilled: number;

            if (totalSupply === 0) {
                volume = 0;
                unsold = 0;
                unfilled = totalDemand;
                // No supply: converge toward cost floor + margin
                const producerNode = nodeConfigs.find((n) => n.outputResource === resName);
                const refPrice = producerNode ? producerNode.costFloor * 1.5 : currentPrice;
                clearingPrice = currentPrice + (refPrice - currentPrice) * (1 / 30);
            } else if (totalDemand === 0) {
                volume = 0;
                unsold = totalSupply;
                unfilled = 0;
                // Supply but no demand: converge toward cost floor
                const producerNode = nodeConfigs.find((n) => n.outputResource === resName);
                const refPrice = producerNode ? producerNode.costFloor : currentPrice;
                clearingPrice = currentPrice + (refPrice - currentPrice) * (1 / 30);
            } else {
                // Both supply and demand: price = weighted average
                const tradeQty = Math.min(totalSupply, totalDemand);
                volume = tradeQty;
                unsold = totalSupply - tradeQty;
                unfilled = totalDemand - tradeQty;
                clearingPrice = currentPrice;
            }

            clearedPrices.set(resName, clearingPrice);
            clearedUnfilled.set(resName, unfilled);
            clearedUnsold.set(resName, unsold);
            clearedVolume.set(resName, volume);
        }

        // For resources with no supply at all, use market price convergence
        for (const [resName, price] of marketPrices) {
            if (!clearedPrices.has(resName)) {
                clearedPrices.set(resName, price);
                clearedUnfilled.set(resName, demandPerResource.get(resName) ?? 0);
                clearedUnsold.set(resName, 0);
                clearedVolume.set(resName, 0);
            }
        }

        // ── Step 3: Execute trades (simplified proportional allocation) ──

        // 3a: Population consumption (take from final node's market supply)
        let foodConsumed = 0;
        let foodNeeded = 0;
        if (finalNode) {
            const finalRes = finalNode.outputResource;
            const finalSupply = supplyPerResource.get(finalRes) ?? 0;
            const actualPopConsumption = Math.min(popDemand, finalSupply);

            foodNeeded = popDemand;
            foodConsumed = actualPopConsumption;

            // Reduce inventory of final node proportionally
            const finalRt = runtimes.get(finalNode.id)!;
            const retainment = retain
                ? finalNode.outputPerScalePerTick * finalRt.scale * pricingParams.outputBufferTicks
                : 0;

            let offeredFinal = Math.max(0, finalRt.inventory - retainment);
            // If sell smoothing is active, cap final node's offered amount too
            if (pricingParams.sellSmoothing && offeredFinal > 0) {
                const perTick = finalNode.outputPerScalePerTick * finalRt.scale;
                const smoothedMax = finalRt.lastSold * (1 + SELL_SMOOTHING_HEADROOM) + perTick;
                offeredFinal = Math.min(offeredFinal, Math.max(0, smoothedMax));
            }

            if (offeredFinal > 0) {
                const consumptionFromStorage = actualPopConsumption * (finalRt.inventory / offeredFinal);
                finalRt.inventory = Math.max(0, finalRt.inventory - consumptionFromStorage);
                finalRt.lastSold = actualPopConsumption;
            } else {
                finalRt.lastSold = 0;
            }
        }

        // 3b: Inter-node trade (upstream sells to downstream)

        // Pre-compute offered amounts with smoothing for each node
        const adjustedSupply = new Map<string, number>();
        for (const [_, rt] of runtimes) {
            const retainment = retain
                ? rt.config.outputPerScalePerTick * rt.scale * pricingParams.outputBufferTicks
                : 0;
            const surplus = Math.max(0, rt.inventory - retainment);
            let offered = surplus;
            if (pricingParams.sellSmoothing && surplus > 0) {
                const perTick = rt.config.outputPerScalePerTick * rt.scale;
                const smoothedMax = rt.lastSold * (1 + SELL_SMOOTHING_HEADROOM) + perTick;
                offered = Math.min(surplus, Math.max(0, smoothedMax));
            }
            adjustedSupply.set(rt.config.outputResource, offered);
        }

        for (const nc of nodeConfigs) {
            if (!nc.inputResource) {
                continue;
            }
            const rt = runtimes.get(nc.id)!;
            const inputRes = nc.inputResource;

            // How much input does this node want? (same calculation as step 1)
            const baseRate = nc.inputPerScalePerTick * rt.scale;
            const inputTarget = baseRate * pricingParams.inputBufferTargetTicks;
            const currentInput = rt.inputInventory;
            const rawShortfall = Math.max(0, inputTarget - currentInput);

            let inputShortfall = rawShortfall;
            if (pricingParams.buySmoothing) {
                const fillRatio = inputTarget > 0 ? Math.min(1, currentInput / inputTarget) : 0;
                const cappedDemand = baseRate * (1 + INVENTORY_SMOOTHING_MAX_EXTRA * (1 - fillRatio));
                inputShortfall = Math.min(rawShortfall, cappedDemand);
            }

            // How much is available from upstream? (use smoothed supply)
            const upstreamNode = nodeConfigs.find((n) => n.outputResource === inputRes);
            let availableForPurchase = 0;
            if (upstreamNode) {
                const upRt = runtimes.get(upstreamNode.id)!;
                const retainment = retain
                    ? upstreamNode.outputPerScalePerTick * upRt.scale * pricingParams.outputBufferTicks
                    : 0;
                const surplus = Math.max(0, upRt.inventory - retainment);
                let offered = surplus;
                if (pricingParams.sellSmoothing && surplus > 0) {
                    const perTick = upstreamNode.outputPerScalePerTick * upRt.scale;
                    const smoothedMax = upRt.lastSold * (1 + SELL_SMOOTHING_HEADROOM) + perTick;
                    offered = Math.min(surplus, Math.max(0, smoothedMax));
                }
                availableForPurchase = offered;
            }

            const actualBought = Math.min(inputShortfall, availableForPurchase);

            // Execute: move goods
            if (actualBought > 0 && upstreamNode) {
                const upRt = runtimes.get(upstreamNode.id)!;
                upRt.inventory -= actualBought;
                upRt.lastSold = actualBought;
                rt.inputInventory += actualBought;

                rt.lastBought = actualBought;
                rt.lastDemanded = inputShortfall;
            } else {
                rt.lastBought = 0;
                rt.lastDemanded = inputShortfall;
            }
        }

        // 3c: Production (transform input → output)
        for (const [_id, rt] of runtimes) {
            const nc = rt.config;

            // Resource efficiency (do we have enough input?)
            let resourceEfficiency = 1;
            if (nc.inputResource && nc.inputPerScalePerTick > 0) {
                const required = nc.inputPerScalePerTick * rt.scale;
                const available = rt.inputInventory;
                resourceEfficiency = required > 0 ? Math.min(1, available / required) : 1;
            }

            const overallEfficiency = resourceEfficiency;

            if (nc.inputResource && nc.inputPerScalePerTick > 0) {
                const toConsume = nc.inputPerScalePerTick * rt.scale * overallEfficiency;
                rt.inputInventory = Math.max(0, rt.inputInventory - toConsume);
            }

            const produced = nc.outputPerScalePerTick * rt.scale * overallEfficiency;
            rt.inventory += produced;

            // ── Step 4: Compute signal for this node ──
            const perTick = nc.outputPerScalePerTick * Math.max(nc.maxScale, 1);
            const totalDemand = demandPerResource.get(nc.outputResource) ?? 0;
            const totalSupply = supplyPerResource.get(nc.outputResource) ?? 0;
            const unfilledDemand = clearedUnfilled.get(nc.outputResource) ?? 0;
            const unsoldSupply = clearedUnsold.get(nc.outputResource) ?? 0;
            const marketPrice = clearedPrices.get(nc.outputResource) ?? 0;

            rt.signal = computeFacilitySignal(
                rt.inventory,
                perTick,
                totalDemand,
                totalSupply,
                unfilledDemand,
                unsoldSupply,
                marketPrice,
                pricingParams.outputBufferTicks,
            );

            // ── Step 5: PID control (adjust scale) ──
            const delta = computePidDelta(rt.signal, rt.pidState, pidParams);
            const newScale = Math.max(nc.maxScale * 0.1, Math.min(nc.maxScale, rt.scale + delta));
            rt.scale = newScale;

            // ── Step 6: Pricing ──
            const currentPrice = marketPrices.get(nc.outputResource) ?? 0;
            const newOfferPrice = computeOfferPrice(
                rt.inventory,
                rt.lastSold,
                currentPrice,
                initialPriceForResource(nc.outputResource, nodeConfigs),
                nc.costFloor,
                nc.outputPerScalePerTick * rt.scale,
                pricingParams,
                pricingParams.outputBufferTicks,
            );
            marketPrices.set(nc.outputResource, newOfferPrice);
            rt.price = newOfferPrice;

            if (nc.inputResource) {
                const inputPrice = marketPrices.get(nc.inputResource) ?? 0;
                const inputCostFloor =
                    nodeConfigs.find((n) => n.outputResource === nc.inputResource)?.costFloor ?? nc.costFloor;
                const inputCeiling = inputCostFloor * pricingParams.bidOfferMaxCostMultiplier;
                const inputTarget = nc.inputPerScalePerTick * rt.scale * pricingParams.inputBufferTargetTicks;
                const inputShortfall = Math.max(0, inputTarget - rt.inputInventory);

                rt.bidPrice = computeBidPrice(
                    inputShortfall,
                    inputTarget,
                    inputPrice,
                    inputCeiling,
                    inputCostFloor,
                    rt.lastBought,
                    rt.lastDemanded,
                    rt.bidPrice,
                    pricingParams,
                );
            }
        }

        // ── Step 7: Population feedback (after production, update for next tick) ──
        if (population > 0 && foodPerCapita > 0) {
            const consumptionRatio = foodNeeded > 0 ? foodConsumed / foodNeeded : 1;
            if (consumptionRatio >= 1.0) {
                population *= 1 + POP_GROWTH_RATE;
            } else if (consumptionRatio < 0.5) {
                population *= 1 - POP_DECLINE_RATE;
            }
            // Between 0.5 and 1.0: population is roughly stable (mild decline)
        }

        // ── Record snapshot ──
        const snap: SimSnapshot = {
            tick,
            nodes: {},
            population: population > 0 ? population : undefined,
            foodConsumed,
            foodNeeded,
        };
        for (const [id, rt] of runtimes) {
            const totalDemand = demandPerResource.get(rt.config.outputResource) ?? 0;
            const totalSupply = supplyPerResource.get(rt.config.outputResource) ?? 0;
            snap.nodes[id] = {
                tick,
                nodeId: id,
                scale: rt.scale,
                inventory: rt.inventory,
                price: rt.price,
                sold: rt.lastSold,
                bought: rt.lastBought,
                signal: rt.signal,
                unfilledDemand: clearedUnfilled.get(rt.config.outputResource) ?? 0,
                unsoldSupply: clearedUnsold.get(rt.config.outputResource) ?? 0,
                totalDemand,
                totalSupply,
            };
        }
        results.push(snap);
    }

    return results;
}

// ── Utility ──────────────────────────────────────────────────────────────────

export function getNodeSeries(snapshots: SimSnapshot[], nodeId: string, field: keyof NodeStateSnapshot): number[] {
    return snapshots.map((s) => (s.nodes[nodeId]?.[field] ?? 0) as number);
}

export function getOscillationAmplitude(series: number[]): number {
    if (series.length < 10) {
        return 0;
    }
    const recent = series.slice(-Math.min(series.length, 120));
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const maxDev = Math.max(...recent.map((v) => Math.abs(v - mean)));
    return mean > 0 ? maxDev / mean : maxDev;
}
