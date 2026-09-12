import {
    BID_ANCHOR_MULTIPLE,
    DEFAULT_COST_SPRING_STRENGTH,
    FREE_QUANTITY_SMOOTHING_MAX_EXTRA,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_UP,
    PRICE_CEIL,
    PRICE_FLOOR,
    SELL_THROUGH_EMA_ALPHA,
    SPRING_NORMALIZATION,
    TARGET_SELL_THROUGH,
    TICKS_PER_MONTH,
    TICKS_PER_YEAR,
} from '../../src/simulation/constants';
import { sellThroughFactor } from '../../src/simulation/market/automaticPricing';
import {
    CONTRACTION_INTEGRAL_DECAY,
    CONTRACTION_INTEGRAL_MAX,
    CONTRACTION_INTEGRAL_THRESHOLD,
    EXPANSION_INTEGRAL_DECAY,
    EXPANSION_INTEGRAL_MAX,
    EXPANSION_INTEGRAL_THRESHOLD,
    MARKET_OVERHANG_FULL_PENALTY_TICKS,
    MAX_SCALE_CONTRACT_FRACTION,
    MAX_SCALE_EXPAND_FRACTION,
    MIN_SCALE_FRACTION,
    PID_D_ALPHA,
    PID_IMAX,
    PID_KD,
    PID_KI,
    PID_KP,
    PID_OUT_MAX_DOWN,
    PID_OUT_MAX_UP,
    SIGNAL_EMA_ALPHA,
    UNSOLD_SCARCITY_FORGIVENESS,
} from '../../src/simulation/planet/automaticProductionScale/constants';

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

type Controller = 'signal' | 'feedforward' | 'inventory';

interface NodeConfig {
    inputRatio: number;
    pricingFloorBuffer: number;
}

interface NodeState {
    scale: number;
    maxScale: number;
    inventory: number;
    price: number;
    smoothedSellThrough: number;
    pidIntegral: number;
    filteredError: number;
    prevFilteredError: number;
    expansionIntegral: number;
    contractionIntegral: number;
    efficiency: number;
    lastSold: number;
    smoothedSignal: number;
}

const makeNode = (initialMaxScale: number, initialInventory: number): NodeState => ({
    scale: initialMaxScale,
    maxScale: initialMaxScale,
    inventory: initialInventory,
    price: 1,
    smoothedSellThrough: 1,
    pidIntegral: 0,
    filteredError: 0,
    prevFilteredError: 0,
    expansionIntegral: 0,
    contractionIntegral: 0,
    efficiency: 1,
    lastSold: 1,
    smoothedSignal: 0,
});

interface TickOutcome {
    signal: number;
    fillRate: number;
    sold: number;
    offered: number;
    rawConsumed: number;
}


function computePidDelta(
    signal: number,
    state: NodeState,
    pidOutMaxDown: number = PID_OUT_MAX_DOWN,
    pidOutMaxUp: number = PID_OUT_MAX_UP,
): number {
    state.filteredError = PID_D_ALPHA * signal + (1 - PID_D_ALPHA) * state.filteredError;
    const P = PID_KP * signal;
    const D = PID_KD * (state.filteredError - state.prevFilteredError);
    state.prevFilteredError = state.filteredError;
    if (signal > 0 && state.pidIntegral < 0) {
        state.pidIntegral = 0;
    }
    const tentative = P + state.pidIntegral + D;
    const outSat = clamp(tentative, -pidOutMaxDown, pidOutMaxUp);
    const saturatedUp = signal > 0 && outSat >= pidOutMaxUp;
    const saturatedDown = signal < 0 && outSat <= -pidOutMaxDown;
    if (!saturatedUp && !saturatedDown) {
        state.pidIntegral = clamp(state.pidIntegral + PID_KI * signal, -PID_IMAX, PID_IMAX);
    }
    return clamp(P + state.pidIntegral + D, -pidOutMaxDown, pidOutMaxUp);
}

interface SimConfig {
    growthPercentPerYear: number;
    seedOvershoot: number;
    inventoryMonths: number;
    controller: Controller;
    reserveMargin: number;
    flowPrice?: boolean;
    noOverhang?: boolean;
    weeksPrice?: boolean;
    targetFrac: number;
    invExpRate: number;
    invConRate: number;
    pidDown?: number;
    pidUp?: number;
    signalEma?: number;
    targetMode?: 'need' | 'maxscale' | 'scale';
    capProductionBySpace?: boolean;
    chainLength?: 2 | 3;
    clampPrice?: boolean;
    noUpstreamCap?: boolean;
}

export const DEFAULT_CONFIG: SimConfig = {
    growthPercentPerYear: Number(process.env.GROWTH ?? 0.6),
    seedOvershoot: Number(process.env.SEED_OVERSHOOT ?? 1.05),
    inventoryMonths: Number(process.env.INVENTORY_MONTHS ?? 50),
    controller: (process.env.CONTROLLER as Controller) ?? 'signal',
    reserveMargin: Number(process.env.RESERVE_MARGIN ?? 0.15),
    flowPrice: process.env.FLOW_PRICE === '1',
    noOverhang: process.env.NO_OVERHANG === '1',
    weeksPrice: process.env.WEEKS_PRICE === '1',
    targetFrac: Number(process.env.TARGET_FRAC ?? 0.33),
    invExpRate: Number(process.env.INV_EXP_RATE ?? 1.0),
    invConRate: Number(process.env.INV_CON_RATE ?? 0.1),
    pidDown: Number(process.env.PID_DOWN ?? PID_OUT_MAX_DOWN),
    pidUp: Number(process.env.PID_UP ?? PID_OUT_MAX_UP),
    signalEma: Number(process.env.SIGNAL_EMA ?? 1),
    targetMode: (process.env.TARGET_MODE as 'need' | 'maxscale' | 'scale') ?? 'need',
    capProductionBySpace: process.env.CAP_BY_SPACE !== '0',
    chainLength: (Number(process.env.CHAIN_LENGTH ?? 2) === 3 ? 3 : 2) as 2 | 3,
    clampPrice: process.env.CLAMP_PRICE === '1',
    noUpstreamCap: process.env.NO_UPSTREAM_CAP === '1',
};

const MAX_HORIZON_YEARS = 600;
const STARVATION_FILL_THRESHOLD = 0.5;
const STARVATION_MONTHS = 12;
const DEFAULT_PRICING_BUFFER = Number(process.env.PRICING_BUFFER ?? 1.1);

function pricingFixedPoint(sigma: number, buffer: number, costSpring = DEFAULT_COST_SPRING_STRENGTH): number {
    const factor = sellThroughFactor(sigma, TARGET_SELL_THROUGH, PRICE_ADJUST_MAX_UP, PRICE_ADJUST_MAX_DOWN);
    const K = costSpring * SPRING_NORMALIZATION;
    if (factor >= 1) {
        return buffer;
    }
    return buffer / (1 + Math.pow((1 - factor) / K, 2));
}

function tickNode(
    state: NodeState,
    cfg: NodeConfig,
    need: number,
    controller: Controller,
    sim: SimConfig,
    upstreamFeedCap: number,
    effOverride: number,
): TickOutcome {
    const floor = 1;
    const affordabilityCeil = BID_ANCHOR_MULTIPLE * floor;
    const invMax = sim.inventoryMonths * TICKS_PER_MONTH * Math.max(need, state.scale);

    const production = state.scale * state.efficiency * effOverride;
    const space = Math.max(0, invMax - state.inventory);
    const produced = sim.capProductionBySpace ? Math.min(production, space + state.lastSold) : production;
    state.inventory += produced;
    const rawConsumed = produced * cfg.inputRatio;

    const retainment = TICKS_PER_MONTH * need;
    const surplus = Math.max(0, state.inventory - retainment);
    const offered = Math.min(surplus, Math.max(100, surplus / FREE_QUANTITY_SMOOTHING_MAX_EXTRA));
    const affordable = state.price <= affordabilityCeil;
    const sold = affordable ? Math.min(offered, Math.max(0, need)) : 0;
    state.inventory -= sold;
    state.lastSold = sold;
    const unsold = Math.max(0, offered - sold);
    const unfilled = Math.max(0, need - sold);

    const rawSigmaOffer = sim.flowPrice ? (production > 0 ? sold / production : 1) : offered > 0 ? sold / offered : 1;
    state.smoothedSellThrough =
        SELL_THROUGH_EMA_ALPHA * rawSigmaOffer + (1 - SELL_THROUGH_EMA_ALPHA) * state.smoothedSellThrough;
    const factor = sim.weeksPrice
        ? 1 + 0.05 * clamp((2 - state.inventory / Math.max(1e-9, TICKS_PER_MONTH * Math.max(1e-9, need))) / 2, -1, 1)
        : sellThroughFactor(
              state.smoothedSellThrough,
              TARGET_SELL_THROUGH,
              PRICE_ADJUST_MAX_UP,
              PRICE_ADJUST_MAX_DOWN,
          );
    const brakeTop = cfg.pricingFloorBuffer * floor;
    const deviation = Math.sqrt(Math.max(0, brakeTop / state.price - 1));
    const netFactor = factor + DEFAULT_COST_SPRING_STRENGTH * SPRING_NORMALIZATION * deviation;
    state.price = clamp(state.price * netFactor, PRICE_FLOOR, PRICE_CEIL);
    if (sim.clampPrice) {
        state.price = Math.min(state.price, affordabilityCeil);
    }

    const unfilledFrac = need > 0 ? unfilled / need : 0;
    const flowSellThrough = production > 0 ? sold / production : 1;
    const flowDeviation = flowSellThrough - 1;
    const flowAdjusted =
        unfilledFrac > 0
            ? Math.max(flowDeviation, -unfilledFrac * UNSOLD_SCARCITY_FORGIVENESS)
            : flowDeviation;
    const overhangRatio = need > 0 ? unsold / Math.max(1, need) : 0;
    const overhangPenalty = sim.noOverhang ? 0 : -Math.min(1, overhangRatio / MARKET_OVERHANG_FULL_PENALTY_TICKS);
    const rawSignal = clamp(unfilledFrac + flowAdjusted + overhangPenalty, -1, 1);
    state.smoothedSignal = SIGNAL_EMA_ALPHA * rawSignal + (1 - SIGNAL_EMA_ALPHA) * state.smoothedSignal;
    const signal = state.smoothedSignal;

    const targetScale =
        controller === 'feedforward'
            ? (need * (1 + sim.reserveMargin)) / Math.max(1e-9, state.efficiency * effOverride)
            : 1;

    const targetBasis =
        sim.targetMode === 'scale' ? state.scale : sim.targetMode === 'maxscale' ? state.maxScale : need;
    const invCap = sim.inventoryMonths * TICKS_PER_MONTH * Math.max(targetBasis, state.scale);
    const invTarget = sim.targetFrac * sim.inventoryMonths * TICKS_PER_MONTH * targetBasis;

    let signalForControl =
        controller === 'feedforward'
            ? clamp((targetScale - state.scale) / Math.max(1e-9, targetScale), -1, 1)
            : controller === 'inventory'
              ? clamp((invTarget - state.inventory) / Math.max(1e-9, invTarget), -1, 1)
              : signal;
    if (sim.signalEma < 1) {
        state.smoothedSignal = sim.signalEma * signalForControl + (1 - sim.signalEma) * state.smoothedSignal;
        signalForControl = state.smoothedSignal;
    }

    const pidOut = computePidDelta(signalForControl, state, sim.pidDown, sim.pidUp);
    const delta = pidOut * state.maxScale;
    state.scale = clamp(state.scale + delta, MIN_SCALE_FRACTION * state.maxScale, state.maxScale);

    const atMaxScale = state.scale >= state.maxScale * 0.999;

    if (controller === 'inventory') {
        const atMinScale = state.scale <= MIN_SCALE_FRACTION * state.maxScale * 1.001;
        if (atMaxScale && state.inventory < invTarget) {
            state.expansionIntegral = Math.min(
                EXPANSION_INTEGRAL_MAX,
                state.expansionIntegral + sim.invExpRate,
            );
        } else {
            state.expansionIntegral = Math.max(0, state.expansionIntegral - EXPANSION_INTEGRAL_DECAY);
        }
        if (atMinScale && state.inventory > invTarget) {
            state.contractionIntegral = Math.min(
                CONTRACTION_INTEGRAL_MAX,
                state.contractionIntegral + sim.invConRate,
            );
        } else {
            state.contractionIntegral = Math.max(0, state.contractionIntegral - CONTRACTION_INTEGRAL_DECAY);
        }
    } else {
        if (atMaxScale && signalForControl > 0) {
            state.expansionIntegral = Math.min(EXPANSION_INTEGRAL_MAX, state.expansionIntegral + signalForControl);
        } else {
            state.expansionIntegral = Math.max(0, state.expansionIntegral - EXPANSION_INTEGRAL_DECAY);
        }

        const contractionStrength =
            state.scale <= 0.2 * state.maxScale && signalForControl < 0 ? -signalForControl : 0;
        if (contractionStrength > 0) {
            state.contractionIntegral = Math.min(
                CONTRACTION_INTEGRAL_MAX,
                state.contractionIntegral + contractionStrength,
            );
        } else {
            state.contractionIntegral = Math.max(0, state.contractionIntegral - CONTRACTION_INTEGRAL_DECAY);
        }
    }

    if (state.expansionIntegral >= EXPANSION_INTEGRAL_THRESHOLD) {
        state.maxScale = Math.min(state.maxScale * (1 + MAX_SCALE_EXPAND_FRACTION), upstreamFeedCap);
        state.expansionIntegral = 0;
    }
    if (state.contractionIntegral >= CONTRACTION_INTEGRAL_THRESHOLD) {
        state.maxScale = Math.max(state.maxScale * (1 - MAX_SCALE_CONTRACT_FRACTION), MIN_SCALE_FRACTION);
        state.contractionIntegral = 0;
    }

    return { signal, fillRate: need > 0 ? sold / Math.max(1, need) : 1, sold, offered, rawConsumed };
}

interface RunResult {
    years: number;
    collapsed: boolean;
    collapseMechanism: string;
    rows: {
        year: number;
        converterScale: number;
        mineScale: number;
        mineMaxScale: number;
        rootMineScale: number;
        rootMineMaxScale: number;
        priceOverCost: number;
        fill: number;
        signal: number;
    }[];
}

export function simulate(config: SimConfig): RunResult {
    const gPerTick = Math.pow(1 + config.growthPercentPerYear / 100, 1 / TICKS_PER_YEAR) - 1;
    const converterCfg: NodeConfig = { inputRatio: 1.5, pricingFloorBuffer: DEFAULT_PRICING_BUFFER };
    const mineCfg: NodeConfig = {
        inputRatio: config.chainLength === 3 ? 1.5 : 0,
        pricingFloorBuffer: DEFAULT_PRICING_BUFFER,
    };
    const rootMineCfg: NodeConfig = { inputRatio: 0, pricingFloorBuffer: DEFAULT_PRICING_BUFFER };

    const initialStock = 2 * TICKS_PER_MONTH;
    const converter = makeNode(config.seedOvershoot, initialStock);
    const mine = makeNode(config.seedOvershoot * converterCfg.inputRatio, initialStock * converterCfg.inputRatio);
    const rootMine = makeNode(
        config.seedOvershoot * converterCfg.inputRatio * mineCfg.inputRatio,
        initialStock * converterCfg.inputRatio * mineCfg.inputRatio,
    );
    let mineSoldRatio = 1;
    let rootMineSoldRatio = 1;

    const totalTicks = MAX_HORIZON_YEARS * TICKS_PER_YEAR;
    const rows: RunResult['rows'] = [];
    rows.push({
        year: 0,
        converterScale: converter.scale,
        mineScale: mine.scale,
        mineMaxScale: mine.maxScale,
        rootMineScale: rootMine.scale,
        rootMineMaxScale: rootMine.maxScale,
        priceOverCost: converter.price,
        fill: 1,
        signal: 0,
    });
    let starvationMonths = 0;
    let monthFillSum = 0;
    let collapseYear = MAX_HORIZON_YEARS;
    let collapseMechanism = 'survived';

    for (let tick = 1; tick <= totalTicks; tick++) {
        const demandMultiplier = Math.pow(1 + gPerTick, tick);
        const demand = demandMultiplier;

        const converterEff = Math.max(0, Math.min(1, mineSoldRatio));
        const converterOutcome = tickNode(
            converter,
            converterCfg,
            demand,
            config.controller,
            config,
            config.noUpstreamCap ? Infinity : mine.maxScale / converterCfg.inputRatio,
            converterEff,
        );

        const mineNeed = converterOutcome.rawConsumed;
        const mineEff = config.chainLength === 3 ? Math.max(0, Math.min(1, rootMineSoldRatio)) : 1;
        const mineFeedCap = config.chainLength === 3 ? rootMine.maxScale / mineCfg.inputRatio : Infinity;
        const mineOutcome = tickNode(
            mine,
            mineCfg,
            mineNeed,
            config.controller,
            config,
            config.noUpstreamCap ? Infinity : mineFeedCap,
            mineEff,
        );
        mineSoldRatio = mineNeed > 0 ? mineOutcome.sold / mineNeed : 1;

        const rootMineNeed = mineOutcome.rawConsumed;
        const rootMineOutcome =
            config.chainLength === 3
                ? tickNode(rootMine, rootMineCfg, rootMineNeed, config.controller, config, Infinity, 1)
                : null;
        if (rootMineOutcome) {
            rootMineSoldRatio = rootMineNeed > 0 ? rootMineOutcome.sold / rootMineNeed : 1;
        }

        monthFillSum += converterOutcome.fillRate;
        if (tick % TICKS_PER_MONTH === 0) {
            const monthFill = monthFillSum / TICKS_PER_MONTH;
            monthFillSum = 0;
            if (process.env.TRACE && tick / TICKS_PER_MONTH <= Number(process.env.TRACE)) {
                const year = tick / TICKS_PER_YEAR;
                console.log(
                    `   m${tick / TICKS_PER_MONTH} y${year.toFixed(1)} fill ${monthFill.toFixed(2)} conv ${converter.scale.toFixed(2)}/${converter.maxScale.toFixed(2)} mine ${mine.scale.toFixed(2)}/${mine.maxScale.toFixed(2)} convInv ${converter.inventory.toFixed(0)} mineInv ${mine.inventory.toFixed(0)} eff ${converterEff.toFixed(2)} sig ${converter.smoothedSignal.toFixed(2)} p ${converter.price.toFixed(2)}`,
                );
            }
            if (monthFill < STARVATION_FILL_THRESHOLD) {
                starvationMonths++;
            } else {
                starvationMonths = 0;
            }
            if (starvationMonths >= STARVATION_MONTHS) {
                collapseYear = tick / TICKS_PER_YEAR;
                collapseMechanism =
                    converterEff < 0.5
                        ? 'input starvation (upstream contracted)'
                        : 'demand avalanche (capacity below demand, buffer drained)';
                break;
            }
        }

        if (tick % TICKS_PER_YEAR === 0) {
            rows.push({
                year: tick / TICKS_PER_YEAR,
                converterScale: converter.scale,
                mineScale: mine.scale,
                mineMaxScale: mine.maxScale,
                rootMineScale: rootMine.scale,
                rootMineMaxScale: rootMine.maxScale,
                priceOverCost: converter.price,
                fill: converterOutcome.fillRate,
                signal: converterOutcome.signal,
            });
        }
    }

    return {
        years: collapseYear,
        collapsed: starvationMonths >= STARVATION_MONTHS,
        collapseMechanism,
        rows,
    };
}

function printFixedPointTable(): void {
    const buffer = DEFAULT_PRICING_BUFFER;
    console.log('1) PRICING FIXED POINT - cost floor c = 1, price p* solves factor(sigma) + K*sqrt(buffer/p* - 1) = 1');
    console.log('   buffer = effective brake zone (sim AUTOMATED_COST_FLOOR_BUFFER = 1.5; the observed sub-cost pin at');
    console.log('   0.6-0.7x implies ~1.1 once the theoretical-floor vs realized-cost gap is accounted for).\n');
    console.log('   sellThrough   factor     p*/c   margin@c');
    for (let i = 0; i <= 10; i++) {
        const sigma = i / 10;
        const factor = sellThroughFactor(sigma, TARGET_SELL_THROUGH, PRICE_ADJUST_MAX_UP, PRICE_ADJUST_MAX_DOWN);
        const pStar = pricingFixedPoint(sigma, buffer);
        console.log(`   ${sigma.toFixed(1).padStart(6)}     ${factor.toFixed(4).padStart(7)}  ${pStar.toFixed(3).padStart(6)}  ${(pStar - 1).toFixed(3).padStart(7)}`);
    }
    console.log('');
    console.log('   The map alone settles at/above cost. The sub-cost regime requires chronic over-supply (sigma ~ 0),');
    console.log('   which the inventory rule guarantees whenever storage autoscales with demand.\n');
}

function main(): void {
    const g = DEFAULT_CONFIG.growthPercentPerYear;
    printFixedPointTable();

    console.log(`2) BASELINE CHAIN - signal controller, growth ${g}%/yr, seed overshoot ${DEFAULT_CONFIG.seedOvershoot}x, storage ${DEFAULT_CONFIG.inventoryMonths} months\n`);
    console.log('   year   convScale  mineScale  p/c     fill    signal');
    const baseline = simulate({ ...DEFAULT_CONFIG, controller: 'signal' });
    for (const row of baseline.rows) {
        console.log(
            `   y${String(row.year).padStart(4)}  ${row.converterScale.toFixed(1).padStart(7)}  ${row.mineScale.toFixed(1).padStart(7)}  ${row.priceOverCost.toFixed(2).padStart(5)}  ${row.fill.toFixed(2).padStart(5)}  ${row.signal.toFixed(2).padStart(6)}`,
        );
    }
    console.log(
        baseline.collapsed
            ? `\n   COLLAPSE at y${baseline.years.toFixed(1)} (${baseline.collapseMechanism})\n`
            : `\n   SURVIVED ${MAX_HORIZON_YEARS}y\n`,
    );

    const growths = [0.2, 0.6, 1.0, 2.0];
    console.log('3) COLLAPSE HORIZON vs DEMAND GROWTH - signal controller\n');
    console.log('   growth%/yr   collapse y   mechanism');
    for (const gg of growths) {
        const r = simulate({ ...DEFAULT_CONFIG, growthPercentPerYear: gg, controller: 'signal' });
        console.log(`   ${gg.toFixed(1).padStart(8)}   ${(r.collapsed ? r.years : MAX_HORIZON_YEARS).toFixed(1).padStart(8)}   ${r.collapseMechanism}`);
    }

    const scanController = DEFAULT_CONFIG.controller === 'signal' ? 'feedforward' : DEFAULT_CONFIG.controller;
    const scanLabel =
        scanController === 'feedforward'
            ? 'feedforward controller (capacity target = demand x (1+reserve), profitability only a solvency constraint)'
            : 'inventory controller (production keeps storage at target; expand at empty, contract at full)';
    console.log(`\n4) SAME SCAN - ${scanLabel}\n`);
    console.log('   growth%/yr   collapse y   mechanism');
    for (const gg of growths) {
        const r = simulate({ ...DEFAULT_CONFIG, growthPercentPerYear: gg, controller: scanController });
        console.log(`   ${gg.toFixed(1).padStart(8)}   ${(r.collapsed ? r.years : MAX_HORIZON_YEARS).toFixed(1).padStart(8)}   ${r.collapseMechanism}`);
    }

    console.log('\n5) INTERPRETATION');
    console.log('   The collapse clock: capacity(t)/demand(t) = seedOvershoot x (1 - contractionRate)^t / (1 + g)^t.');
    console.log('   What the simulation shows (same mechanism as the longrun collapses, compressed ~7x because this is a');
    console.log('   single chain without the sim multi-chain inertia):');
    console.log('   1. Over-supply drives the signal negative. The inventory rule (storage autoscales with demand,');
    console.log('      offers surplus/10 per tick) keeps the offer sell-through below target -> price pinned near/below');
    console.log('      cost, the overhang penalty fires -> the signal is biased negative even at balance.');
    console.log('   2. Self-reinforcing contraction spiral. The mine production slightly exceeds the converter raw');
    console.log('      consumption -> its signal turns negative -> it contracts -> the upstream cap on the converter');
    console.log('      expansion (computeDynamicExpansionTarget, faithfully modeled) pulls the converter down -> it needs');
    console.log('      less raw -> the mine over-produces more -> contracts more. The whole industrial core shrinks at');
    console.log('      ~1-2%/yr while the population demand grows at g.');
    console.log('   3. Terminal event: demand outgrows the contracted capacity, the buffer drains, the price reaches the');
    console.log('      affordability ceiling (BID_ANCHOR_MULTIPLE) and buyers stop crossing -> fill -> 0 -> collapse.');
    console.log('   The horizon scales monotonically with g (0.2%:y68, 0.6%:y37, 1%:y29, 2%:y22) - the "clock" is');
    console.log('   contractionRate + g, NOT any single facility, price or resource.');
    console.log('   The feedforward controller (capacity = buyer demand x (1+reserve), profitability demoted to a');
    console.log('   solvency constraint) removes the biased observable: capacity tracks demand and the chain survives');
    console.log('   600y at every tested growth rate (bounded only by resource depletion, which is out of scope here).');
    console.log('\n   Env knobs: GROWTH, SEED_OVERSHOOT, INVENTORY_MONTHS, CONTROLLER=signal|feedforward, RESERVE_MARGIN,');
    console.log('   PRICING_BUFFER, TRACE=<months>');
}

if (process.env.RUN_MAIN === '1' || !process.argv[1] || process.argv[1].endsWith('chainModel.ts')) {
    main();
}



