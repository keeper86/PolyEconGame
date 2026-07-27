import { PRICE_FLOOR, PRICE_CEIL, PRICE_ADJUST_MAX_UP, PRICE_ADJUST_MAX_DOWN } from '@/simulation/constants';

// ── Types ────────────────────────────────────────────────────────────────────

export type SellDiagnostics = {
    sellThroughRate: number;
    targetSellThrough: number;
    baseFactor: number;
    costSpringDeviation: number;
    overDeviation: number;
    netFactor: number;
    oldPrice: number;
    newPrice: number;
    costFloor: number;
    marketPrice: number;
    effectiveQuantity: number;
    rawRetainment: number;
    surplusRatio?: number;
};

export type BuyDiagnostics = {
    fillRate: number;
    targetFillRate: number;
    baseFactor: number;
    ceilingPrice: number;
    ceilingSpring: number;
    netFactor: number;
    oldBidPrice: number;
    newBidPrice: number;
    costFloor: number;
    marketPrice: number;
    shortfall: number;
    storageTarget: number;
};

export type SideMode = 'sell' | 'buy';

export type DemandModel =
    | { type: 'constant'; soldPerTick: number }
    | { type: 'elastic'; baseDemand: number; elasticity: number; noiseStd: number }
    | { type: 'random'; mean: number; std: number }
    | { type: 'step'; initial: number; afterTick: number; newValue: number }
    | { type: 'sine'; mean: number; amplitude: number; periodTicks: number };

export interface SellScenario {
    mode: 'sell';
    initialPrice: number;
    inventory: number;
    baseRate: number;
    costFloor: number;
    marketPrice: number;
    lastSold: number;
    targetSellThrough: number;
    priceAdjustMaxUp: number;
    priceAdjustMaxDown: number;
    costSpringStrength: number;
    inventorySmoothingMaxExtra: number;
    outputBufferMaxTicks: number;
    automatedCostFloorBuffer: number;
    freeRetainment: number;
    freeRetainmentSmoothingMaxExtra: number;
    bidOfferMaxCostMultiplier: number;
    demandModel: DemandModel;
}

export interface BuyScenario {
    mode: 'buy';
    initialPrice: number;
    marketPrice: number;
    costFloor: number;
    shortfall: number;
    storageTarget: number;
    lastBought: number;
    lastDemanded: number;
    targetFillRate: number;
    priceAdjustMaxUp: number;
    priceAdjustMaxDown: number;
    costSpringStrength: number;
    inventorySmoothingMaxExtra: number;
    inputBufferTargetTicks: number;
    freeBuyQuantity: number;
    freeBuyQuantitySmoothingMaxExtra: number;
    bidOfferMaxCostMultiplier: number;
    demandModel: DemandModel;
}

export type Scenario = SellScenario | BuyScenario;

export interface TickResult {
    tick: number;
    price: number;
    diagnostics: SellDiagnostics | BuyDiagnostics;
    soldOrBought: number;
    inventory: number;
}

// ── Default scenarios ────────────────────────────────────────────────────────

export const SELL_DEFAULTS: SellScenario = {
    mode: 'sell',
    initialPrice: 100,
    inventory: 1000,
    baseRate: 50,
    costFloor: 80,
    marketPrice: 100,
    lastSold: 45,
    targetSellThrough: 0.9,
    priceAdjustMaxUp: PRICE_ADJUST_MAX_UP,
    priceAdjustMaxDown: PRICE_ADJUST_MAX_DOWN,
    costSpringStrength: 0.1,
    inventorySmoothingMaxExtra: 2,
    outputBufferMaxTicks: 20,
    automatedCostFloorBuffer: 1.5,
    freeRetainment: 0,
    freeRetainmentSmoothingMaxExtra: 2,
    bidOfferMaxCostMultiplier: 6,
    demandModel: { type: 'constant', soldPerTick: 45 },
};

export const BUY_DEFAULTS: BuyScenario = {
    mode: 'buy',
    initialPrice: 100,
    marketPrice: 100,
    costFloor: 80,
    shortfall: 200,
    storageTarget: 1500,
    lastBought: 40,
    lastDemanded: 45,
    targetFillRate: 0.9,
    priceAdjustMaxUp: PRICE_ADJUST_MAX_UP,
    priceAdjustMaxDown: PRICE_ADJUST_MAX_DOWN,
    costSpringStrength: 0.1,
    inventorySmoothingMaxExtra: 2,
    inputBufferTargetTicks: 30,
    freeBuyQuantity: 0,
    freeBuyQuantitySmoothingMaxExtra: 2,
    bidOfferMaxCostMultiplier: 6,
    demandModel: { type: 'constant', soldPerTick: 40 },
};

// ── Demand simulation ────────────────────────────────────────────────────────

function simulateDemand(model: DemandModel, tick: number, currentPrice: number): number {
    switch (model.type) {
        case 'constant':
            return model.soldPerTick;
        case 'elastic': {
            const priceRatio = currentPrice > 0 ? 1 : 1;
            const base = model.baseDemand * Math.pow(priceRatio, -model.elasticity);
            const noise = model.noiseStd > 0 ? (Math.random() - 0.5) * 2 * model.noiseStd : 0;
            return Math.max(0, base + noise);
        }
        case 'random': {
            const noise = (Math.random() - 0.5) * 2 * model.std;
            return Math.max(0, model.mean + noise);
        }
        case 'step':
            return tick < model.afterTick ? model.initial : model.newValue;
        case 'sine': {
            const phase = (2 * Math.PI * tick) / model.periodTicks;
            return Math.max(0, model.mean + model.amplitude * Math.sin(phase));
        }
    }
}

// ── Sell-side pricing (replicating adjustOfferPrice logic) ───────────────────

function computeSellPrice(
    inventoryQty: number,
    lastSold: number,
    currentPrice: number,
    initialPrice: number,
    costFloor: number,
    baseRate: number,
    cfg: {
        targetSellThrough: number;
        priceAdjustMaxUp: number;
        priceAdjustMaxDown: number;
        costSpringStrength: number;
        inventorySmoothingMaxExtra: number;
        outputBufferMaxTicks: number;
        automatedCostFloorBuffer: number;
        freeRetainment: number;
        freeRetainmentSmoothingMaxExtra: number;
    },
): { newPrice: number; effectiveQuantity: number; diagnostics: SellDiagnostics; newRetainment: number } {
    if (currentPrice === undefined || currentPrice <= 0) {
        const p = Math.max(PRICE_FLOOR, initialPrice);
        return {
            newPrice: p,
            effectiveQuantity: 0,
            diagnostics: {
                sellThroughRate: 0,
                targetSellThrough: cfg.targetSellThrough,
                baseFactor: 1,
                costSpringDeviation: 0,
                overDeviation: 0,
                netFactor: 1,
                oldPrice: currentPrice,
                newPrice: p,
                costFloor,
                marketPrice: initialPrice,
                effectiveQuantity: 0,
                rawRetainment: 0,
            },
            newRetainment: 0,
        };
    }

    // Sell-side inventory smoothing
    const freeRetainment = cfg.freeRetainment;
    let retainment = freeRetainment;
    let surplusRatio: number | undefined;
    const surplus = Math.max(0, inventoryQty - retainment);
    if (surplus > 1e-4) {
        if (baseRate > 1e-4) {
            // Producer smoothing
            const referenceQty = baseRate * cfg.outputBufferMaxTicks;
            surplusRatio = Math.min(1, surplus / Math.max(1e-4, referenceQty));
            const smoothedOffer = baseRate * (1 + cfg.inventorySmoothingMaxExtra * surplusRatio);
            const effectiveRetainment = Math.max(retainment, inventoryQty - smoothedOffer);
            retainment = Math.min(effectiveRetainment, inventoryQty);
        } else {
            // Non-producer smoothing
            const smoothingDays = Math.max(1, cfg.freeRetainmentSmoothingMaxExtra);
            const perTick = surplus / smoothingDays;
            const effectiveRetainment = Math.max(retainment, inventoryQty - perTick);
            retainment = Math.min(effectiveRetainment, inventoryQty);
        }
    }

    const effectiveQuantity = Math.max(0, inventoryQty - retainment);

    const sellThrough = effectiveQuantity > 0 ? lastSold / effectiveQuantity : 1;
    const factor = sellThroughFactor(sellThrough, cfg.targetSellThrough, cfg.priceAdjustMaxUp, cfg.priceAdjustMaxDown);

    const brakeZoneTop = costFloor * cfg.automatedCostFloorBuffer;
    const deviation = Math.sqrt(Math.max(0, brakeZoneTop / currentPrice - 1));
    const netFactor = factor + cfg.costSpringStrength * deviation;
    const rawPrice = currentPrice * netFactor;
    const clampedPrice = Math.min(PRICE_CEIL, Math.max(PRICE_FLOOR, rawPrice));

    return {
        newPrice: clampedPrice,
        effectiveQuantity,
        newRetainment: retainment,
        diagnostics: {
            sellThroughRate: sellThrough,
            targetSellThrough: cfg.targetSellThrough,
            baseFactor: factor,
            costSpringDeviation: deviation,
            overDeviation: 0,
            netFactor,
            oldPrice: currentPrice,
            newPrice: clampedPrice,
            costFloor,
            marketPrice: initialPrice,
            effectiveQuantity,
            rawRetainment: 0,
            surplusRatio,
        },
    };
}

// ── Buy-side pricing (replicating adjustBidPrice logic) ──────────────────────

function computeBuyPrice(
    shortfall: number,
    storageTarget: number,
    marketPrice: number,
    ceilingPrice: number,
    costFloor: number,
    lastBought: number,
    lastDemanded: number,
    currentBidPrice: number | undefined,
    cfg: {
        targetFillRate: number;
        priceAdjustMaxUp: number;
        priceAdjustMaxDown: number;
        costSpringStrength: number;
    },
): { newPrice: number; diagnostics: BuyDiagnostics } {
    if (shortfall <= 1e-4 || shortfall === undefined) {
        if (currentBidPrice === undefined || currentBidPrice <= 0) {
            return {
                newPrice: Math.max(PRICE_FLOOR, marketPrice),
                diagnostics: {
                    fillRate: 1,
                    targetFillRate: cfg.targetFillRate,
                    baseFactor: 1,
                    ceilingPrice,
                    ceilingSpring: 0,
                    netFactor: 1,
                    oldBidPrice: currentBidPrice ?? marketPrice,
                    newBidPrice: Math.max(PRICE_FLOOR, marketPrice),
                    costFloor,
                    marketPrice,
                    shortfall,
                    storageTarget,
                },
            };
        }
        return {
            newPrice: currentBidPrice,
            diagnostics: {
                fillRate: 1,
                targetFillRate: cfg.targetFillRate,
                baseFactor: 1,
                ceilingPrice,
                ceilingSpring: 0,
                netFactor: 1,
                oldBidPrice: currentBidPrice,
                newBidPrice: currentBidPrice,
                costFloor,
                marketPrice,
                shortfall,
                storageTarget,
            },
        };
    }

    if (currentBidPrice === undefined || currentBidPrice <= 0) {
        return {
            newPrice: Math.max(PRICE_FLOOR, marketPrice),
            diagnostics: {
                fillRate: 1,
                targetFillRate: cfg.targetFillRate,
                baseFactor: 1,
                ceilingPrice,
                ceilingSpring: 0,
                netFactor: 1,
                oldBidPrice: marketPrice,
                newBidPrice: Math.max(PRICE_FLOOR, marketPrice),
                costFloor,
                marketPrice,
                shortfall,
                storageTarget,
            },
        };
    }

    const effectiveDemanded = lastDemanded > 0 ? lastDemanded : shortfall;
    const fillRate = effectiveDemanded > 0 ? lastBought / effectiveDemanded : 1;
    const baseFactor = fillRateFactor(fillRate, cfg.targetFillRate, cfg.priceAdjustMaxUp, cfg.priceAdjustMaxDown);

    const overDeviation = Math.sqrt(Math.max(0, currentBidPrice / ceilingPrice - 1));
    const ceilingSpring = cfg.costSpringStrength * overDeviation;
    const factor = baseFactor - ceilingSpring;
    const rawPrice = currentBidPrice * factor;
    const clampedPrice = Math.max(PRICE_FLOOR, Math.min(PRICE_CEIL, rawPrice));

    return {
        newPrice: clampedPrice,
        diagnostics: {
            fillRate,
            targetFillRate: cfg.targetFillRate,
            baseFactor,
            ceilingPrice,
            ceilingSpring,
            netFactor: factor,
            oldBidPrice: currentBidPrice,
            newBidPrice: clampedPrice,
            costFloor,
            marketPrice,
            shortfall,
            storageTarget,
        },
    };
}

// ── Factor helpers ────────────────────────────────────────────────────────────

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

// ── Simulator ─────────────────────────────────────────────────────────────────

export function runSimulation(scenario: Scenario, numTicks: number): TickResult[] {
    const results: TickResult[] = [];

    let inventory: number;
    let currentPrice: number;
    let lastSoldOrBought: number;
    let lastDemanded: number;
    let shortfall: number;
    let storageTarget: number;

    if (scenario.mode === 'sell') {
        inventory = scenario.inventory;
        currentPrice = scenario.initialPrice;
        lastSoldOrBought = scenario.lastSold;
        lastDemanded = 0;
        shortfall = 0;
        storageTarget = 0;
    } else {
        inventory = scenario.storageTarget - scenario.shortfall;
        currentPrice = scenario.initialPrice;
        lastSoldOrBought = scenario.lastBought;
        lastDemanded = scenario.lastDemanded;
        shortfall = scenario.shortfall;
        storageTarget = scenario.storageTarget;
    }

    for (let t = 0; t < numTicks; t++) {
        if (scenario.mode === 'sell') {
            const s = scenario;
            const demand = simulateDemand(s.demandModel, t, currentPrice);
            const actualSold = Math.min(demand, inventory);

            const { newPrice, diagnostics } = computeSellPrice(
                inventory,
                actualSold,
                currentPrice,
                s.initialPrice,
                s.costFloor,
                s.baseRate,
                {
                    targetSellThrough: s.targetSellThrough,
                    priceAdjustMaxUp: s.priceAdjustMaxUp,
                    priceAdjustMaxDown: s.priceAdjustMaxDown,
                    costSpringStrength: s.costSpringStrength,
                    inventorySmoothingMaxExtra: s.inventorySmoothingMaxExtra,
                    outputBufferMaxTicks: s.outputBufferMaxTicks,
                    automatedCostFloorBuffer: s.automatedCostFloorBuffer,
                    freeRetainment: s.freeRetainment,
                    freeRetainmentSmoothingMaxExtra: s.freeRetainmentSmoothingMaxExtra,
                },
            );

            inventory += s.baseRate - actualSold;
            inventory = Math.max(0, inventory);
            currentPrice = newPrice;
            lastSoldOrBought = actualSold;

            results.push({
                tick: t,
                price: newPrice,
                diagnostics,
                soldOrBought: actualSold,
                inventory,
            });
        } else {
            const b = scenario;
            const ceilingPrice = Math.min(PRICE_CEIL, b.costFloor * b.bidOfferMaxCostMultiplier);

            const { newPrice, diagnostics } = computeBuyPrice(
                shortfall,
                storageTarget,
                b.marketPrice,
                ceilingPrice,
                b.costFloor,
                lastSoldOrBought,
                lastDemanded,
                currentPrice,
                {
                    targetFillRate: b.targetFillRate,
                    priceAdjustMaxUp: b.priceAdjustMaxUp,
                    priceAdjustMaxDown: b.priceAdjustMaxDown,
                    costSpringStrength: b.costSpringStrength,
                },
            );

            const demand = simulateDemand(b.demandModel, t, currentPrice);
            const actualBought = Math.min(demand, shortfall);
            inventory += actualBought;
            shortfall = Math.max(0, shortfall - actualBought);
            currentPrice = newPrice;
            lastSoldOrBought = actualBought;
            lastDemanded = demand;

            results.push({
                tick: t,
                price: newPrice,
                diagnostics,
                soldOrBought: actualBought,
                inventory,
            });
        }
    }

    return results;
}

// ── Preset scenarios ──────────────────────────────────────────────────────────

export const PRESET_SCENARIOS: Record<string, Scenario> = {
    'sell-stable': {
        mode: 'sell',
        initialPrice: 100,
        inventory: 1000,
        baseRate: 50,
        costFloor: 80,
        marketPrice: 100,
        lastSold: 45,
        targetSellThrough: 0.9,
        priceAdjustMaxUp: PRICE_ADJUST_MAX_UP,
        priceAdjustMaxDown: PRICE_ADJUST_MAX_DOWN,
        costSpringStrength: 0.1,
        inventorySmoothingMaxExtra: 2,
        outputBufferMaxTicks: 20,
        automatedCostFloorBuffer: 1.5,
        freeRetainment: 0,
        freeRetainmentSmoothingMaxExtra: 2,
        bidOfferMaxCostMultiplier: 6,
        demandModel: { type: 'constant', soldPerTick: 45 },
    },
    'sell-glut': {
        mode: 'sell',
        initialPrice: 100,
        inventory: 5000,
        baseRate: 50,
        costFloor: 80,
        marketPrice: 100,
        lastSold: 20,
        targetSellThrough: 0.9,
        priceAdjustMaxUp: PRICE_ADJUST_MAX_UP,
        priceAdjustMaxDown: PRICE_ADJUST_MAX_DOWN,
        costSpringStrength: 0.1,
        inventorySmoothingMaxExtra: 2,
        outputBufferMaxTicks: 20,
        automatedCostFloorBuffer: 1.5,
        freeRetainment: 0,
        freeRetainmentSmoothingMaxExtra: 2,
        bidOfferMaxCostMultiplier: 6,
        demandModel: { type: 'constant', soldPerTick: 15 },
    },
    'sell-shortage': {
        mode: 'sell',
        initialPrice: 100,
        inventory: 50,
        baseRate: 10,
        costFloor: 80,
        marketPrice: 100,
        lastSold: 45,
        targetSellThrough: 0.9,
        priceAdjustMaxUp: PRICE_ADJUST_MAX_UP,
        priceAdjustMaxDown: PRICE_ADJUST_MAX_DOWN,
        costSpringStrength: 0.3,
        inventorySmoothingMaxExtra: 2,
        outputBufferMaxTicks: 20,
        automatedCostFloorBuffer: 1.5,
        freeRetainment: 0,
        freeRetainmentSmoothingMaxExtra: 2,
        bidOfferMaxCostMultiplier: 6,
        demandModel: { type: 'constant', soldPerTick: 45 },
    },
    'sell-cost-pressure': {
        mode: 'sell',
        initialPrice: 55,
        inventory: 3000,
        baseRate: 50,
        costFloor: 100,
        marketPrice: 100,
        lastSold: 48,
        targetSellThrough: 0.9,
        priceAdjustMaxUp: PRICE_ADJUST_MAX_UP,
        priceAdjustMaxDown: PRICE_ADJUST_MAX_DOWN,
        costSpringStrength: 0.5,
        inventorySmoothingMaxExtra: 2,
        outputBufferMaxTicks: 20,
        automatedCostFloorBuffer: 1.5,
        freeRetainment: 0,
        freeRetainmentSmoothingMaxExtra: 2,
        bidOfferMaxCostMultiplier: 6,
        demandModel: { type: 'constant', soldPerTick: 50 },
    },
    'sell-demand-shock': {
        mode: 'sell',
        initialPrice: 100,
        inventory: 1000,
        baseRate: 50,
        costFloor: 80,
        marketPrice: 100,
        lastSold: 45,
        targetSellThrough: 0.9,
        priceAdjustMaxUp: PRICE_ADJUST_MAX_UP,
        priceAdjustMaxDown: PRICE_ADJUST_MAX_DOWN,
        costSpringStrength: 0.1,
        inventorySmoothingMaxExtra: 2,
        outputBufferMaxTicks: 20,
        automatedCostFloorBuffer: 1.5,
        freeRetainment: 0,
        freeRetainmentSmoothingMaxExtra: 2,
        bidOfferMaxCostMultiplier: 6,
        demandModel: { type: 'step', initial: 45, afterTick: 30, newValue: 10 },
    },
    'buy-stable': {
        mode: 'buy',
        initialPrice: 100,
        marketPrice: 100,
        costFloor: 80,
        shortfall: 200,
        storageTarget: 1500,
        lastBought: 40,
        lastDemanded: 45,
        targetFillRate: 0.9,
        priceAdjustMaxUp: PRICE_ADJUST_MAX_UP,
        priceAdjustMaxDown: PRICE_ADJUST_MAX_DOWN,
        costSpringStrength: 0.1,
        inventorySmoothingMaxExtra: 2,
        inputBufferTargetTicks: 30,
        freeBuyQuantity: 0,
        freeBuyQuantitySmoothingMaxExtra: 2,
        bidOfferMaxCostMultiplier: 6,
        demandModel: { type: 'constant', soldPerTick: 45 },
    },
    'buy-desperate': {
        mode: 'buy',
        initialPrice: 50,
        marketPrice: 100,
        costFloor: 80,
        shortfall: 2000,
        storageTarget: 3000,
        lastBought: 10,
        lastDemanded: 45,
        targetFillRate: 0.9,
        priceAdjustMaxUp: 1.1,
        priceAdjustMaxDown: 0.9,
        costSpringStrength: 0.2,
        inventorySmoothingMaxExtra: 2,
        inputBufferTargetTicks: 30,
        freeBuyQuantity: 0,
        freeBuyQuantitySmoothingMaxExtra: 2,
        bidOfferMaxCostMultiplier: 6,
        demandModel: { type: 'constant', soldPerTick: 10 },
    },
    'buy-demand-spike': {
        mode: 'buy',
        initialPrice: 100,
        marketPrice: 100,
        costFloor: 80,
        shortfall: 200,
        storageTarget: 1500,
        lastBought: 40,
        lastDemanded: 45,
        targetFillRate: 0.9,
        priceAdjustMaxUp: PRICE_ADJUST_MAX_UP,
        priceAdjustMaxDown: PRICE_ADJUST_MAX_DOWN,
        costSpringStrength: 0.1,
        inventorySmoothingMaxExtra: 2,
        inputBufferTargetTicks: 30,
        freeBuyQuantity: 0,
        freeBuyQuantitySmoothingMaxExtra: 2,
        bidOfferMaxCostMultiplier: 6,
        demandModel: { type: 'step', initial: 45, afterTick: 20, newValue: 100 },
    },
};
