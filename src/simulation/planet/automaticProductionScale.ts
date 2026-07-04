import assert from 'assert';
import { EPSILON, MIN_EMPLOYABLE_AGE, OUTPUT_BUFFER_MAX_TICKS, RECYCLER_PAYMENT_RATIO } from '../constants';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';
import { getRecyclerPaymentRatio, processFacilityContraction } from '../agents/recycler';
import type { PidState, ProductionFacility } from './facility';
import {
    calculateCostsForConstruction,
    getFacilityType,
    MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
    queryStorageFacility,
} from './facility';
import { constructionServiceResourceType } from './services';
import type { Agent, AgentPlanetAssets, GameState, Planet } from './planet';

export const INPUT_EFFICIENCY_MIN = 0.5;
export const MAX_SCALE_EXPAND_FRACTION = 0.01;
export const EXPANSION_DEPOSIT_THRESHOLD = 2.0;

export const PID_KP = 0.05;

export const PID_KI = 0.001;

export const PID_KD = 0.025;
export const PID_IMAX = 0.025;
export const PID_OUT_MAX = 0.05;
export const PID_D_ALPHA = 0.3;

export const EXPANSION_INTEGRAL_THRESHOLD = 30;
export const EXPANSION_INTEGRAL_MAX = 180;
export const EXPANSION_INTEGRAL_DECAY = 0.5;
export const EXPANSION_PRICE_INFLATION_THRESHOLD = 3.0;
export const EXPANSION_WORKER_RESERVE_MARGIN = 0.3;

// ── Contraction constants ──
export const MAX_SCALE_CONTRACT_FRACTION = 0.1;
export const CONTRACTION_INTEGRAL_THRESHOLD = 30;
export const CONTRACTION_INTEGRAL_MAX = 180;
export const CONTRACTION_INTEGRAL_DECAY = 0.5;
export const CONTRACTION_EFFICIENCY_THRESHOLD = 0.5;

function getDefaultPidState(): PidState {
    return { integral: 0, prevError: 0, filteredError: 0, expansionIntegral: 0, contractionIntegral: 0 };
}
function computeFacilitySignal(facility: ProductionFacility, assets: AgentPlanetAssets, planet: Planet): number {
    const { lastTickResults, produces, maxScale } = facility;

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
            'Own supply should be non-negative and finite, but got' + ownSupply,
        );

        const perTick = output.quantity * Math.max(maxScale, 1);
        const buffer = perTick > 0 ? ownSupply / perTick : 0;

        assert(isFinite(buffer) && buffer >= 0, 'Buffer should be non-negative and finite, but got' + buffer);

        const overfilled =
            buffer >= OUTPUT_BUFFER_MAX_TICKS ? (buffer / (buffer + OUTPUT_BUFFER_MAX_TICKS) - 0.5) * 2 : 0;
        assert(
            overfilled >= -1 && overfilled <= 1,
            'Overfill signal should be between -1 and 1, but got' +
                overfilled +
                ' (buffer=' +
                buffer +
                ')' +
                ', supply=' +
                ownSupply +
                ', perTick=' +
                perTick,
        );

        const unfilledFrac = totalDemand > 0 ? avg.unfilledDemand / totalDemand : 0;
        const unsoldFrac = totalSupply > 0 ? avg.unsoldSupply / totalSupply : 0;
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
        const OVERFILL_PENALTY = 1.0;

        weightedOutputSignalSum +=
            price *
            (WEIGHT_UNFILLED * unfilledFrac -
                WEIGHT_UNSOLD * unsoldFrac -
                OVERFILL_PENALTY * overfilled +
                WEIGHT_BALANCE * balance);
        totalWeight += price * (WEIGHT_UNFILLED + WEIGHT_UNSOLD + WEIGHT_BALANCE + OVERFILL_PENALTY);
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
    const outSat = Math.max(-PID_OUT_MAX, Math.min(PID_OUT_MAX, tentativeOutput));
    const saturated = Math.abs(outSat) >= PID_OUT_MAX;
    const errorSameDirection = (signal > 0 && outSat > 0) || (signal < 0 && outSat < 0);
    if (!saturated || !errorSameDirection) {
        state.integral = Math.max(-PID_IMAX, Math.min(PID_IMAX, state.integral + PID_KI * signal));
    }

    const output = Math.max(-PID_OUT_MAX, Math.min(PID_OUT_MAX, P + state.integral + D));
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

function hasSufficientUnemployedWorkers(facility: ProductionFacility, planet: Planet): boolean {
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
            // We expand by MAX_SCALE_EXPAND_FRACTION of current maxScale, at minimum +1
            const currentMax = facility.maxScale;
            const targetMax = Math.max(Math.ceil(currentMax * (1 + MAX_SCALE_EXPAND_FRACTION)), currentMax + 1);
            const additionalWorkers = req * (targetMax - currentMax);
            totalRequiredNewWorkers += additionalWorkers;
        }
    }

    if (totalRequiredNewWorkers <= 0) {
        return false;
    }

    // Require at least a margin of reserve workers beyond what we need
    const requiredWithReserve = totalRequiredNewWorkers * (1 + EXPANSION_WORKER_RESERVE_MARGIN);
    return totalAvailableUnemployed >= requiredWithReserve;
}

function hasSufficientFundsForExpansion(
    assets: AgentPlanetAssets,
    planet: Planet,
    totalConstructionServiceRequired: number,
): boolean {
    const constructionPrice = planet.marketPrices[constructionServiceResourceType.name] ?? 0;
    if (constructionPrice <= 0) {
        return false;
    }
    const estimatedCost = totalConstructionServiceRequired * constructionPrice;
    return assets.deposits >= EXPANSION_DEPOSIT_THRESHOLD * estimatedCost;
}

function initiateCapacityExpansion(facility: ProductionFacility, assets: AgentPlanetAssets, planet: Planet): boolean {
    const currentMax = facility.maxScale;
    const targetMax = Math.max(Math.ceil(currentMax * (1 + MAX_SCALE_EXPAND_FRACTION)), currentMax + 1);
    const facilityType = getFacilityType(facility);
    const totalCost = calculateCostsForConstruction(facilityType, currentMax, targetMax);

    if (!hasSufficientFundsForExpansion(assets, planet, totalCost)) {
        return false;
    }

    facility.construction = {
        type: 'expansion',
        constructionTargetMaxScale: targetMax,
        totalConstructionServiceRequired: totalCost,
        maximumConstructionServiceConsumption: totalCost / MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
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
    const ratio = getRecyclerPaymentRatio(planet) / RECYCLER_PAYMENT_RATIO;
    if (ratio < 0.1) {
        return false;
    }

    const currentMax = facility.maxScale;
    const targetMax = Math.max(1, Math.floor(currentMax * (1 - MAX_SCALE_CONTRACT_FRACTION * ratio)));
    if (targetMax >= currentMax) {
        return false; // Cannot contract any further
    }

    const facilityType = getFacilityType(facility);
    const replacementCost = calculateCostsForConstruction(facilityType, targetMax, currentMax);

    // Delegate full contraction (payment, CS recovery, scale reduction, ticker event) to the recycler agent
    return processFacilityContraction(planet, facility, agent, targetMax, replacementCost, gameState);
}

export function updateAgentProductionScale(gameState: GameState, planet: Planet): void {
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

            const signal = computeFacilitySignal(facility, assets, planet); // weighted market demand/supply signal
            assert(signal >= -1, 'Signal should be >= -1, but got ' + signal);
            assert(signal <= 1, 'Signal should be capped at 1, but got' + signal);

            const state: PidState = { ...getDefaultPidState(), ...facility.pidState };

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

            // Check worker availability for expansion
            const hasWorkers = hasSufficientUnemployedWorkers(facility, planet);

            if (
                facility.scale >= facility.maxScale &&
                facility.construction === null &&
                state.expansionIntegral >= dynamicThreshold &&
                facility.lastTickResults?.overallEfficiency > 0.95 &&
                hasWorkers
            ) {
                const expanded = initiateCapacityExpansion(facility, assets, planet);
                if (expanded) {
                    state.expansionIntegral = 0;
                }
            }

            // Contraction: trigger when facility is at the lower bound, under-performing, and sufficient negative signal has accumulated
            if (
                atLowerBound &&
                facility.construction === null &&
                state.contractionIntegral >= CONTRACTION_INTEGRAL_THRESHOLD &&
                (facility.lastTickResults?.overallEfficiency ?? 1) < CONTRACTION_EFFICIENCY_THRESHOLD
            ) {
                const contracted = initiateCapacityContraction(facility, planet, agent, gameState);
                if (contracted) {
                    state.contractionIntegral = 0;
                }
            }

            facility.pidState = state;
        }
    });
}
