import assert from 'assert';
import { MIN_EMPLOYABLE_AGE, OUTPUT_BUFFER_MAX_TICKS } from '../constants';
import type { PidState, ProductionFacility } from './facility';
import {
    calculateCostsForConstruction,
    getFacilityType,
    MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
    queryStorageFacility,
} from './facility';
import type { Agent, AgentPlanetAssets, Planet } from './planet';
import { constructionServiceResourceType } from './services';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';

export const OUTPUT_BUFFER_FULL_TICKS = OUTPUT_BUFFER_MAX_TICKS;
export const INPUT_EFFICIENCY_MIN = 0.5;
export const MAX_SCALE_EXPAND_FRACTION = 0.01;
export const EXPANSION_DEPOSIT_THRESHOLD = 2.0;

export const PID_KP = 0.02;

export const PID_KI = 0.005;

export const PID_KD = 0.01;
export const PID_IMAX = 0.05;
export const PID_OUT_MAX = 0.05;
export const PID_D_ALPHA = 0.3;

export const EXPANSION_INTEGRAL_THRESHOLD = 30;

export const EXPANSION_INTEGRAL_MAX = 60;

export const EXPANSION_INTEGRAL_DECAY = 0.5;

export const EXPANSION_PRICE_INFLATION_THRESHOLD = 3.0;

export const EXPANSION_WORKER_RESERVE_MARGIN = 0.3;

function getDefaultPidState(): PidState {
    return { integral: 0, prevError: 0, filteredError: 0, expansionIntegral: 0 };
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

        const totalProduced = planet.producedResources[output.resource.name] ?? 0;
        const totalConsumed = planet.consumedResources[output.resource.name] ?? 0;

        const avg = lastResult;

        const price = avg.clearingPrice;

        assert(isFinite(price) && price > 0, 'Price should be positive and finite, but got' + price);

        const ownSupply = queryStorageFacility(storage, output.resource.name);

        assert(
            isFinite(ownSupply) && ownSupply >= 0,
            'Own supply should be non-negative and finite, but got' + ownSupply,
        );

        const perTick = output.quantity * Math.max(maxScale, 1);
        const buffer = perTick > 0 ? ownSupply / perTick : 0;

        assert(isFinite(buffer) && buffer >= 0, 'Buffer should be non-negative and finite, but got' + buffer);

        // we do not smooth service inventory. We must take depreciation into account as we should target more supply as demand on average
        let balance = avg.unfilledDemand - avg.unsoldSupply - totalProduced + totalConsumed;
        if (balance > 0 && buffer >= OUTPUT_BUFFER_FULL_TICKS) {
            balance = 0;
        }
        const maxFlow = Math.max(avg.unfilledDemand, avg.unsoldSupply, totalProduced, totalConsumed);

        weightedOutputSignalSum += (price * balance) / (maxFlow != 0 ? maxFlow : 1);
        totalWeight += price;
    }

    if (totalWeight === 0) {
        if (noData !== produces.length) {
            console.error('No market data for any outputs of facility', facility.id);
        }
        return 0;
    }

    let profitSignal: number | undefined = undefined;
    const costs = lastTickResults.inputCosts + lastTickResults.wageCosts;
    const hasOperated = costs > 0 || lastTickResults.revenue > 0;
    if (hasOperated && isFinite(costs)) {
        const margin = costs > 0 ? (lastTickResults.revenue - costs) / Math.max(costs, lastTickResults.revenue) : 1;
        profitSignal = Math.max(-1, Math.min(1, margin));
    }

    const maxOutputSignal = Math.max(-1, Math.min(1, weightedOutputSignalSum / totalWeight));

    assert(
        isFinite(maxOutputSignal) && maxOutputSignal >= -1 && maxOutputSignal <= 1,
        'Max output signal should be between -1 and 1, but got' + maxOutputSignal,
    );

    let signal = profitSignal !== undefined ? (2 * maxOutputSignal + profitSignal) / 3 : maxOutputSignal;
    if (signal > 0) {
        const eff = Math.max(0.1, lastTickResults.overallEfficiency);
        signal = eff * signal;
    }

    return Math.max(-1, Math.min(1, signal));
}

function computePidDelta(signal: number, state: PidState, maxScale: number): number {
    state.filteredError = PID_D_ALPHA * signal + (1 - PID_D_ALPHA) * state.filteredError;

    const P = PID_KP * signal;
    const D = PID_KD * (state.filteredError - state.prevError);
    state.prevError = state.filteredError;

    if (signal > 0 && state.integral < 0) {
        state.integral = 0;
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

export function updateAgentProductionScale(agents: Map<string, Agent>, planet: Planet): void {
    agents.forEach((agent) => {
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

            const signal = computeFacilitySignal(facility, assets, planet);
            assert(signal >= -1, 'Signal should be positive due to earlier check for market data, but got' + signal);
            assert(signal <= 1, 'Signal should be capped at 1, but got' + signal);

            const state: PidState = { ...getDefaultPidState(), ...facility.pidState };

            const delta = computePidDelta(signal, state, facility.maxScale);
            facility.scale = Math.max(facility.maxScale * 0.1, Math.min(facility.maxScale, facility.scale + delta));

            if (facility.scale === facility.maxScale && signal > 0) {
                state.expansionIntegral = Math.min(EXPANSION_INTEGRAL_MAX, state.expansionIntegral + signal);
            } else {
                state.expansionIntegral = Math.max(0, state.expansionIntegral - EXPANSION_INTEGRAL_DECAY);
            }

            // Compute inflation-aware dynamic threshold
            const priceInflationFactor = computePriceInflationFactor(facility, planet);
            const dynamicThreshold = Math.min(
                EXPANSION_INTEGRAL_MAX,
                EXPANSION_INTEGRAL_THRESHOLD * Math.max(1, priceInflationFactor / EXPANSION_PRICE_INFLATION_THRESHOLD),
            );

            // Check worker availability
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

            facility.pidState = state;
        }
    });
}
