import assert from 'assert';
import { processFacilityContraction } from '../agents/recycler';
import { EPSILON, MIN_EMPLOYABLE_AGE } from '../constants';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';
import { isAutoscaleDebugEnabled, logAutoscaleFacility, logAutoscalePlanet } from './automaticProductionScaleDebug';
import type { PidState, ProductionFacility } from './facility';
import { calculateCostsForConstruction, getFacilityType, queryStorageFacility } from './facility';
import type { Agent, AgentPlanetAssets, GameState, Planet } from './planet';
import { constructionServiceResourceType } from './services';

export const INPUT_EFFICIENCY_MIN = 0.5;
export const MAX_SCALE_EXPAND_FRACTION = 0.1;
export const EXPANSION_PAYMENT_FLOW_MARGIN = 2.0;
export const EXPANSION_WORKING_CAPITAL_TICKS = 15;

export const PID_KP = 0.1;

export const PID_KI = 0.001;

export const PID_KD = 0.01;
export const PID_IMAX = 0.025;
export const PID_OUT_MAX_UP = 0.1;
export const PID_OUT_MAX_DOWN = 0.01;
export const PID_D_ALPHA = 0.3;
export const SIGNAL_EMA_ALPHA = 0.3;

export const EXPANSION_INTEGRAL_THRESHOLD = 30;
export const EXPANSION_INTEGRAL_MAX = 180;
export const EXPANSION_INTEGRAL_DECAY = 0.5;
export const EXPANSION_PRICE_INFLATION_THRESHOLD = 3.0;
export const EXPANSION_WORKER_RESERVE_MARGIN = 0.3;

// ── Contraction constants ──
export const MAX_SCALE_CONTRACT_FRACTION = 0.005;
export const CONTRACTION_INTEGRAL_THRESHOLD = 30;
export const CONTRACTION_INTEGRAL_MAX = 180;
export const CONTRACTION_INTEGRAL_DECAY = 0.5;
export const CONTRACTION_EFFICIENCY_THRESHOLD = 0.5;

function getDefaultPidState(): PidState {
    return {
        integral: 0,
        prevError: 0,
        filteredError: 0,
        expansionIntegral: 0,
        contractionIntegral: 0,
        smoothedSignal: 0,
    };
}
function computeFacilitySignal(facility: ProductionFacility, assets: AgentPlanetAssets, planet: Planet): number {
    const { lastTickResults, produces } = facility;

    let weightedOutputSignalSum = 0;
    let totalWeight = 0;
    let noData = 0;

    const storage = assets.storageFacility;

    for (const output of produces) {
        const lastResult = planet.lastMarketResult[output.resource.name];

        if (!lastResult) {
            noData++;
            continue;
        }

        const avg = lastResult;

        const price = avg.clearingPrice;
        assert(isFinite(price) && price > 0, 'Price should be positive and finite, but got' + price);

        const totalDemand = avg.totalDemand;
        const totalSupply = avg.totalSupply;
        const ownSupply = queryStorageFacility(storage, output.resource.name);

        assert(
            isFinite(ownSupply) && ownSupply >= 0,
            'Own supply should be non-negative and finite, but got' +
                ownSupply +
                ', resource=' +
                output.resource.name +
                ', facility=' +
                facility.name,
        );

        const unfilledFrac = totalDemand > 0 ? avg.unfilledDemand / totalDemand : 0;
        const rawUnsoldFrac = totalSupply > 0 ? avg.unsoldSupply / totalSupply : 0;
        // Saturate unsoldFrac: once more than 50% of offered goods are unsold,
        // additional oversupply has diminishing signal impact.
        // This prevents a 100x inventory dump from creating an extreme signal spike
        // that crashes the PID to the 10% minimum floor.
        const unsoldFrac = rawUnsoldFrac / (rawUnsoldFrac + 0.5);
        const balance = (avg.unfilledDemand - avg.unsoldSupply) / Math.max(1, avg.unfilledDemand + avg.unsoldSupply);

        assert(
            unfilledFrac >= 0 && unfilledFrac <= 1,
            'Unfilled fraction should be between 0 and 1, but got' + unfilledFrac,
        );
        assert(unsoldFrac >= 0 && unsoldFrac <= 1, 'Unsold fraction should be between 0 and 1, but got' + unsoldFrac);
        assert(avg.unfilledDemand >= 0, 'Unfilled demand should be non-negative, but got' + avg.unfilledDemand);
        assert(avg.unsoldSupply >= 0, 'Unsold supply should be non-negative, but got' + JSON.stringify(avg));
        assert(balance >= -1 && balance <= 1, 'Balance should be between -1 and 1, but got' + balance);

        const WEIGHT_UNFILLED = 1.0;
        const WEIGHT_UNSOLD = 0.5;
        const WEIGHT_BALANCE = 2.0;

        weightedOutputSignalSum +=
            price * (WEIGHT_UNFILLED * unfilledFrac - WEIGHT_UNSOLD * unsoldFrac + WEIGHT_BALANCE * balance);
        totalWeight += price * (WEIGHT_UNFILLED + WEIGHT_UNSOLD + WEIGHT_BALANCE);
    }

    if (totalWeight === 0) {
        if (noData !== produces.length) {
            console.error('No market data for any outputs of facility', facility.id);
        }
        return 0;
    }

    const maxOutputSignal = weightedOutputSignalSum / totalWeight;

    assert(
        isFinite(maxOutputSignal) && maxOutputSignal >= -1 && maxOutputSignal <= 1,
        'Max output signal should be between -1 and 1, but got' + maxOutputSignal,
    );

    let signal = maxOutputSignal;
    if (signal > 0) {
        const eff = Math.max(0.1, lastTickResults.overallEfficiency);
        signal = eff * signal;
    }
    return signal;
}

function computePidDelta(signal: number, state: PidState, maxScale: number): number {
    state.filteredError = PID_D_ALPHA * signal + (1 - PID_D_ALPHA) * state.filteredError;

    const P = PID_KP * signal;
    const D = PID_KD * (state.filteredError - state.prevError);
    state.prevError = state.filteredError;

    if (signal > 0 && state.integral < 0) {
        state.integral = 0;
    }

    if (Math.abs(signal) < EPSILON) {
        state.integral *= 0.5;
    }

    const tentativeOutput = P + state.integral + D;
    const outSat = Math.max(-PID_OUT_MAX_DOWN, Math.min(PID_OUT_MAX_UP, tentativeOutput));
    const saturatedUp = signal > 0 && outSat >= PID_OUT_MAX_UP;
    const saturatedDown = signal < 0 && outSat <= -PID_OUT_MAX_DOWN;
    if (!saturatedUp && !saturatedDown) {
        state.integral = Math.max(-PID_IMAX, Math.min(PID_IMAX, state.integral + PID_KI * signal));
    }

    const output = Math.max(-PID_OUT_MAX_DOWN, Math.min(PID_OUT_MAX_UP, P + state.integral + D));
    return output * maxScale;
}

function computePriceInflationFactor(facility: ProductionFacility, planet: Planet): number {
    let maxFactor = 1;
    for (const output of facility.produces) {
        const costFloor = planet.lastProductionCostFloors[output.resource.name];
        if (costFloor === undefined || costFloor <= 0) {
            continue;
        }

        const lastResult = planet.lastMarketResult[output.resource.name];
        const price =
            lastResult && lastResult.totalSupply > 0
                ? lastResult.clearingPrice
                : (planet.marketPrices[output.resource.name] ?? 0);

        if (price > 0 && isFinite(price)) {
            const factor = price / costFloor;
            if (factor > maxFactor) {
                maxFactor = factor;
            }
        }
    }
    return maxFactor;
}

type ExpansionWorkforceStats = {
    totalAvailableUnemployed: number;
    totalRequiredNewWorkers: number;
    requiredWithReserve: number;
    hasSufficientWorkers: boolean;
};

function computeExpansionWorkforceStats(facility: ProductionFacility, planet: Planet): ExpansionWorkforceStats {
    const demography = planet.population.demography;
    let totalAvailableUnemployed = 0;

    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        for (const edu of educationLevelKeys) {
            for (const skill of SKILL) {
                totalAvailableUnemployed += demography[age].unoccupied[edu][skill].total;
            }
        }
    }

    let totalRequiredNewWorkers = 0;
    for (const edu of educationLevelKeys) {
        const req = facility.workerRequirement[edu] ?? 0;
        if (req > 0) {
            const currentMax = facility.maxScale;
            const targetMax = Math.max(Math.ceil(currentMax * (1 + MAX_SCALE_EXPAND_FRACTION)), currentMax + 1);
            const additionalWorkers = req * (targetMax - currentMax);
            totalRequiredNewWorkers += additionalWorkers;
        }
    }

    if (totalRequiredNewWorkers <= 0) {
        return {
            totalAvailableUnemployed,
            totalRequiredNewWorkers,
            requiredWithReserve: 0,
            hasSufficientWorkers: false,
        };
    }

    const requiredWithReserve = totalRequiredNewWorkers * (1 + EXPANSION_WORKER_RESERVE_MARGIN);
    return {
        totalAvailableUnemployed,
        totalRequiredNewWorkers,
        requiredWithReserve,
        hasSufficientWorkers: totalAvailableUnemployed >= requiredWithReserve,
    };
}

type ExpansionFundsCheckResult = {
    hasSufficientFunds: boolean;
    paymentPerTick: number;
    facilityRevenuePerTick: number;
    requiredWorkingCapital: number;
};

function checkExpansionFunds(
    facility: ProductionFacility,
    assets: AgentPlanetAssets,
    planet: Planet,
    totalConstructionServiceRequired: number,
    time: number,
): ExpansionFundsCheckResult {
    const constructionPrice = planet.marketPrices[constructionServiceResourceType.name] ?? 0;
    if (constructionPrice <= 0 || time <= 0) {
        return {
            hasSufficientFunds: false,
            paymentPerTick: 0,
            facilityRevenuePerTick: 0,
            requiredWorkingCapital: 0,
        };
    }

    const paymentPerTick = (totalConstructionServiceRequired / time) * constructionPrice;
    const requiredWorkingCapital = EXPANSION_WORKING_CAPITAL_TICKS * paymentPerTick;

    // Use potential revenue at 100% efficiency, not last actual revenue.
    // When inputs are scarce, actual revenue is 0 but the facility would be
    // profitable if upstream expanded — blocking expansion on realized revenue
    // creates the very deadlock we are trying to break.
    const facilityRevenuePerTick =
        facility.scale *
        facility.produces.reduce(
            (sum, output) => sum + output.quantity * (planet.marketPrices[output.resource.name] ?? 0),
            0,
        );

    const flowSatisfied = facilityRevenuePerTick >= EXPANSION_PAYMENT_FLOW_MARGIN * paymentPerTick;
    const workingCapitalSatisfied = assets.deposits >= requiredWorkingCapital;
    const hasSufficientFunds = flowSatisfied && workingCapitalSatisfied;

    return { hasSufficientFunds, paymentPerTick, facilityRevenuePerTick, requiredWorkingCapital };
}

function calculateExpansionParams(facility: ProductionFacility): { targetMax: number; cost: number; time: number } {
    const currentMax = facility.maxScale;
    const targetMax = Math.max(Math.ceil(currentMax * (1 + MAX_SCALE_EXPAND_FRACTION)), currentMax + 1);
    const facilityType = getFacilityType(facility);
    const { cost, time } = calculateCostsForConstruction(facilityType, currentMax, targetMax);
    return { targetMax, cost, time };
}

function initiateCapacityExpansion(facility: ProductionFacility, assets: AgentPlanetAssets, planet: Planet): boolean {
    const { targetMax, cost, time } = calculateExpansionParams(facility);

    const fundsCheck = checkExpansionFunds(facility, assets, planet, cost, time);
    if (!fundsCheck.hasSufficientFunds) {
        return false;
    }

    facility.construction = {
        type: 'expansion',
        constructionTargetMaxScale: targetMax,
        totalConstructionServiceRequired: cost,
        maximumConstructionServiceConsumption: cost / time,
        progress: 0,
        lastTickInvestedConstructionServices: 0,
    };
    return true;
}

function initiateCapacityContraction(
    facility: ProductionFacility,
    planet: Planet,
    agent: Agent,
    gameState: GameState,
): boolean {
    const currentMax = facility.maxScale;
    const targetMax = Math.max(1, Math.floor(currentMax * (1 - MAX_SCALE_CONTRACT_FRACTION)));
    if (targetMax >= currentMax) {
        return false; // Cannot contract any further
    }

    // Delegate full contraction (payment, CS recovery, scale reduction, ticker event) to the recycler agent
    return processFacilityContraction(planet, facility, agent, targetMax, gameState);
}

type AutoscaleDebugEntry = {
    tick: number;
    planetId: string;
    agentId: string;
    agentName: string;
    facilityId: string;
    facilityName: string;
    currentMaxScale: number;
    currentScale: number;
    scaleFraction: number;
    rawSignal: number;
    smoothedSignal: number;
    pidDelta: number;
    overallEfficiency: number;
    workerEfficiency: Record<string, number>;
    resourceEfficiency: Record<string, number>;
    worstResourceEfficiency: { resource: string; value: number } | null;
    guards: {
        atMaxScale: boolean;
        hasNoActiveConstruction: boolean;
        positiveSignal: boolean;
        integralAboveThreshold: boolean;
        efficiencyAbove95: boolean;
        workersAvailable: boolean;
        fundsAvailable: boolean;
    };
    workforce: {
        availableUnemployed: number;
        requiredNewWorkers: number;
        requiredWithReserve: number;
    };
    expansion: {
        targetMax: number;
        cost: number;
        time: number;
        estimatedCost: number;
        constructionPrice: number;
        constructionCostFloor: number;
        deposits: number;
        requiredWorkingCapital: number;
        paymentPerTick: number;
        facilityRevenuePerTick: number;
    };
    pid: {
        expansionIntegral: number;
        contractionIntegral: number;
        integral: number;
        smoothedSignal: number;
        dynamicThreshold: number;
    };
    didExpand: boolean;
    blockReason: string[];
};

function collectExpansionDebugContext(
    gameState: GameState,
    planet: Planet,
    agent: Agent,
    facility: ProductionFacility,
    assets: AgentPlanetAssets,
    state: PidState,
    rawSignal: number,
    signal: number,
    delta: number,
    dynamicThreshold: number,
    atMaxScale: boolean,
    hasNoActiveConstruction: boolean,
    integralAboveThreshold: boolean,
    efficiencyAbove95: boolean,
    workforceStats: ExpansionWorkforceStats,
    workersAvailable: boolean,
    fundsAvailable: boolean,
): AutoscaleDebugEntry {
    const { targetMax, cost, time } = calculateExpansionParams(facility);
    const constructionPrice = planet.marketPrices[constructionServiceResourceType.name] ?? 0;
    const constructionCostFloor = planet.lastProductionCostFloors[constructionServiceResourceType.name] ?? 0;
    const estimatedCost = cost * constructionPrice;

    const resourceEfficiency = facility.lastTickResults?.resourceEfficiency ?? {};
    const worstResourceEntry = Object.entries(resourceEfficiency).reduce<{
        resource: string;
        value: number;
    } | null>((worst, [resource, value]) => {
        if (!worst || value < worst.value) {
            return { resource, value };
        }
        return worst;
    }, null);

    const blockReason: string[] = [];
    if (!integralAboveThreshold) {
        blockReason.push('expansionIntegralBelowThreshold');
    }
    if (!efficiencyAbove95) {
        blockReason.push('overallEfficiencyBelow95');
    }
    if (!workersAvailable) {
        blockReason.push('insufficientWorkers');
    }
    if (!fundsAvailable) {
        blockReason.push('insufficientFunds');
    }

    return {
        tick: gameState.tick,
        planetId: planet.id,
        agentId: agent.id,
        agentName: agent.name,
        facilityId: facility.id,
        facilityName: facility.name,
        currentMaxScale: facility.maxScale,
        currentScale: facility.scale,
        scaleFraction: facility.maxScale > 0 ? facility.scale / facility.maxScale : 0,
        rawSignal,
        smoothedSignal: signal,
        pidDelta: delta,
        overallEfficiency: facility.lastTickResults?.overallEfficiency ?? 0,
        workerEfficiency: facility.lastTickResults?.workerEfficiency ?? {},
        resourceEfficiency,
        worstResourceEfficiency: worstResourceEntry,
        guards: {
            atMaxScale,
            hasNoActiveConstruction,
            positiveSignal: signal > 0,
            integralAboveThreshold,
            efficiencyAbove95,
            workersAvailable,
            fundsAvailable,
        },
        workforce: {
            availableUnemployed: workforceStats.totalAvailableUnemployed,
            requiredNewWorkers: workforceStats.totalRequiredNewWorkers,
            requiredWithReserve: workforceStats.requiredWithReserve,
        },
        expansion: {
            targetMax,
            cost,
            time,
            estimatedCost,
            constructionPrice,
            constructionCostFloor,
            deposits: assets.deposits,
            requiredWorkingCapital: EXPANSION_WORKING_CAPITAL_TICKS * (cost / time) * constructionPrice,
            paymentPerTick: (cost / time) * constructionPrice,
            facilityRevenuePerTick:
                facility.scale *
                facility.produces.reduce(
                    (sum, output) => sum + output.quantity * (planet.marketPrices[output.resource.name] ?? 0),
                    0,
                ),
        },
        pid: {
            expansionIntegral: state.expansionIntegral,
            contractionIntegral: state.contractionIntegral,
            integral: state.integral,
            smoothedSignal: state.smoothedSignal,
            dynamicThreshold,
        },
        didExpand: false,
        blockReason,
    };
}

export function updateAgentProductionScale(gameState: GameState, planet: Planet): void {
    const debugAggregates = {
        facilitiesAtMaxScale: 0,
        facilitiesAtMaxScalePositiveSignal: 0,
        expansionCandidates: 0,
        expansionsStarted: 0,
        blockedByIntegral: 0,
        blockedByEfficiency: 0,
        blockedByWorkers: 0,
        blockedByFunds: 0,
    };

    gameState.agents.forEach((agent) => {
        if (!agent.automated) {
            return;
        }

        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }

        for (const facility of assets.productionFacilities) {
            if (facility.construction !== null && facility.construction.type === 'new') {
                continue;
            }

            const hasAnyMarketData = facility.produces.some(
                (o) => planet.lastMarketResult[o.resource.name] !== undefined,
            );
            if (!hasAnyMarketData) {
                continue;
            }

            const rawSignal = computeFacilitySignal(facility, assets, planet); // weighted market demand/supply signal
            assert(rawSignal >= -1, 'Signal should be >= -1, but got ' + rawSignal);
            assert(rawSignal <= 1, 'Signal should be capped at 1, but got' + rawSignal);

            const state: PidState = { ...getDefaultPidState(), ...facility.pidState };

            const signal = SIGNAL_EMA_ALPHA * rawSignal + (1 - SIGNAL_EMA_ALPHA) * state.smoothedSignal;
            state.smoothedSignal = signal;

            const delta = computePidDelta(signal, state, facility.maxScale);
            const newScale = Math.max(facility.maxScale * 0.1, Math.min(facility.maxScale, facility.scale + delta));
            facility.scale = newScale;

            // ── Expansion logic ──
            if (facility.scale === facility.maxScale && signal > 0) {
                state.expansionIntegral = Math.min(EXPANSION_INTEGRAL_MAX, state.expansionIntegral + signal);
            } else {
                state.expansionIntegral = Math.max(0, state.expansionIntegral - EXPANSION_INTEGRAL_DECAY);
            }

            // ── Contraction logic ──
            const atLowerBound = facility.scale <= facility.maxScale * 0.1;
            if (atLowerBound && signal < 0) {
                state.contractionIntegral = Math.min(
                    CONTRACTION_INTEGRAL_MAX,
                    state.contractionIntegral + Math.abs(signal),
                );
            } else {
                state.contractionIntegral = Math.max(0, state.contractionIntegral - CONTRACTION_INTEGRAL_DECAY);
            }

            // Compute inflation-aware dynamic expansion threshold
            const priceInflationFactor = computePriceInflationFactor(facility, planet);
            const dynamicThreshold = Math.min(
                EXPANSION_INTEGRAL_MAX,
                EXPANSION_INTEGRAL_THRESHOLD * Math.max(1, priceInflationFactor / EXPANSION_PRICE_INFLATION_THRESHOLD),
            );

            // ── Expansion decision ──
            const atMaxScale = facility.scale >= facility.maxScale;
            const hasNoActiveConstruction = facility.construction === null;
            const positiveSignal = signal > 0;
            const integralAboveThreshold = state.expansionIntegral >= dynamicThreshold;
            const efficiencyAbove95 = (facility.lastTickResults?.overallEfficiency ?? 0) > 0.95;
            const expansionConditionsMet = atMaxScale && hasNoActiveConstruction && integralAboveThreshold;

            let debugEntry: AutoscaleDebugEntry | null = null;
            let workersAvailable = false;
            let fundsAvailable = false;

            if (isAutoscaleDebugEnabled()) {
                if (atMaxScale) {
                    debugAggregates.facilitiesAtMaxScale++;
                }
                if (atMaxScale && positiveSignal) {
                    debugAggregates.facilitiesAtMaxScalePositiveSignal++;
                }
            }

            const needWorkerFundsCheck =
                expansionConditionsMet || (isAutoscaleDebugEnabled() && atMaxScale && positiveSignal);
            let workforceStats: ExpansionWorkforceStats | null = null;
            if (needWorkerFundsCheck) {
                workforceStats = computeExpansionWorkforceStats(facility, planet);
                workersAvailable = workforceStats.hasSufficientWorkers;
                const expansionParams = calculateExpansionParams(facility);
                fundsAvailable = checkExpansionFunds(
                    facility,
                    assets,
                    planet,
                    expansionParams.cost,
                    expansionParams.time,
                ).hasSufficientFunds;
            }

            if (isAutoscaleDebugEnabled() && atMaxScale && positiveSignal) {
                debugEntry = collectExpansionDebugContext(
                    gameState,
                    planet,
                    agent,
                    facility,
                    assets,
                    state,
                    rawSignal,
                    signal,
                    delta,
                    dynamicThreshold,
                    atMaxScale,
                    hasNoActiveConstruction,
                    integralAboveThreshold,
                    efficiencyAbove95,
                    workforceStats!,
                    workersAvailable,
                    fundsAvailable,
                );
                debugAggregates.expansionCandidates++;
                if (!integralAboveThreshold) {
                    debugAggregates.blockedByIntegral++;
                }
                if (!efficiencyAbove95) {
                    debugAggregates.blockedByEfficiency++;
                }
                if (!workersAvailable) {
                    debugAggregates.blockedByWorkers++;
                }
                if (!fundsAvailable) {
                    debugAggregates.blockedByFunds++;
                }
            }

            if (expansionConditionsMet && workersAvailable) {
                const expanded = initiateCapacityExpansion(facility, assets, planet);
                if (expanded) {
                    state.expansionIntegral = 0;
                    if (debugEntry) {
                        debugEntry.didExpand = true;
                        debugEntry.blockReason = [];
                    }
                    if (isAutoscaleDebugEnabled()) {
                        debugAggregates.expansionsStarted++;
                    }
                }
            }

            if (debugEntry) {
                logAutoscaleFacility(debugEntry);
            }

            // Contraction: trigger when facility is at the lower bound, under-performing, and sufficient negative signal has accumulated
            if (
                atLowerBound &&
                facility.construction === null &&
                state.contractionIntegral >= CONTRACTION_INTEGRAL_THRESHOLD
            ) {
                const contracted = initiateCapacityContraction(facility, planet, agent, gameState);
                if (contracted) {
                    state.contractionIntegral = 0;
                }
            }

            facility.pidState = state;
        }
    });

    if (isAutoscaleDebugEnabled()) {
        logAutoscalePlanet({
            tick: gameState.tick,
            planetId: planet.id,
            planetName: planet.name,
            ...debugAggregates,
            constructionPrice: planet.marketPrices[constructionServiceResourceType.name] ?? 0,
            constructionCostFloor: planet.lastProductionCostFloors[constructionServiceResourceType.name] ?? 0,
            constructionPriceCostFloorRatio:
                (planet.lastProductionCostFloors[constructionServiceResourceType.name] ?? 0) > 0
                    ? (planet.marketPrices[constructionServiceResourceType.name] ?? 0) /
                      planet.lastProductionCostFloors[constructionServiceResourceType.name]
                    : 0,
        });
    }
}
