import assert from 'assert';
import { OUTPUT_BUFFER_MAX_TICKS } from '../constants';
import type { PidState, ProductionFacility } from './facility';
import {
    calculateCostsForConstruction,
    getFacilityType,
    MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
    queryStorageFacility,
} from './facility';
import type { Agent, AgentPlanetAssets, Planet } from './planet';
import { constructionServiceResourceType, groceryServiceResourceType } from './services';
import { PROC_PLANET_ID } from '../initialUniverse';

export const OUTPUT_BUFFER_FULL_TICKS = OUTPUT_BUFFER_MAX_TICKS;
export const INPUT_EFFICIENCY_MIN = 0.5;
export const MAX_SCALE_EXPAND_FRACTION = 0.01;
export const EXPANSION_DEPOSIT_THRESHOLD = 2.0;

export const PID_KP = 0.1;
/** Integral gain: eliminates persistent steady-state offset. */
export const PID_KI = 0.001;
/** Derivative gain: dampens oscillations by braking when error changes. */
export const PID_KD = 0.05;
export const PID_IMAX = 0.05;
export const PID_OUT_MAX = 0.5;
export const PID_D_ALPHA = 0.3;

export const EXPANSION_INTEGRAL_THRESHOLD = 30;
/** Anti-windup ceiling for the expansion accumulator. */
export const EXPANSION_INTEGRAL_MAX = 60;
/**
 * Per-call decay applied to the expansion integral when scale < maxScale
 * or signal is not positive — slowly forgets old demand pressure.
 */
export const EXPANSION_INTEGRAL_DECAY = 0.5;

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
        const orderBook = planet.orderBooks[output.resource.name];

        if (!lastResult && !orderBook?.bids.length) {
            noData++;
            continue;
        }

        // When there is no market history yet but open bids exist, synthesise a
        // MarketResult so the agent can ramp up towards observed demand.
        const avg =
            lastResult ??
            (() => {
                const totalBidQty = orderBook!.bids.reduce((sum, b) => sum + b.quantity, 0);
                return {
                    resourceName: output.resource.name,
                    clearingPrice: 0,
                    totalVolume: 0,
                    totalDemand: totalBidQty,
                    totalSupply: 0,
                    unfilledDemand: totalBidQty,
                    unsoldSupply: 0,
                    productionCost: 0,
                };
            })();

        const price =
            avg.totalSupply > 0
                ? avg.clearingPrice
                : (orderBook?.bids[0]?.price ?? planet.marketPrices[output.resource.name] ?? 0);

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
            buffer >= OUTPUT_BUFFER_FULL_TICKS ? (buffer / (buffer + OUTPUT_BUFFER_FULL_TICKS) - 0.5) * 2 : 0;
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

        if (facility.produces[0]?.resource.name === groceryServiceResourceType.name && planet.id === PROC_PLANET_ID) {
            console.info(
                'Facility',
                facility.id,
                'buffer=',
                buffer,
                'unfilledFrac=',
                unfilledFrac,
                'unsoldFrac=',
                unsoldFrac,
                'balance=',
                balance,
                'overfilled=',
                overfilled,
                'supply=',
                totalSupply,
                'demand=',
                totalDemand,
                'price=',
                price,
            );
        }
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
        const margin = costs > 0 ? (lastTickResults.revenue - costs) / costs : 1;
        profitSignal = Math.max(-1, Math.min(1, margin));
    }

    const maxOutputSignal = weightedOutputSignalSum / totalWeight;

    assert(
        isFinite(maxOutputSignal) && maxOutputSignal >= -1 && maxOutputSignal <= 1,
        'Max output signal should be between -1 and 1, but got' + maxOutputSignal,
    );

    let signal = profitSignal !== undefined ? (maxOutputSignal + profitSignal) / 2 : maxOutputSignal;
    if (signal > 0) {
        const eff = Math.max(0.1, lastTickResults.overallEfficiency);
        signal = eff * signal;
    }

    if (facility.produces[0]?.resource.name === groceryServiceResourceType.name && planet.id === PROC_PLANET_ID) {
        console.info(
            'Facility',
            facility.id,
            'profitSignal=',
            profitSignal,
            'costs_wage',
            lastTickResults.wageCosts,
            'costs_input',
            lastTickResults.inputCosts,
            'revenue',
            lastTickResults.revenue,
            'maxOutputSignal=',
            maxOutputSignal,
            'overallEfficiency=',
            lastTickResults.overallEfficiency,
            'final signal=',
            signal,
        );
    }

    return signal;
}

/**
 * Compute a scale delta using a PID controller.
 * Mutates `state` in-place (integral, prevError, filteredError).
 * Returns an absolute scale delta (already multiplied by maxScale).
 */
function computePidDelta(signal: number, state: PidState, maxScale: number): number {
    // Low-pass filter on error to reduce noise in the derivative term.
    state.filteredError = PID_D_ALPHA * signal + (1 - PID_D_ALPHA) * state.filteredError;

    const P = PID_KP * signal;
    const D = PID_KD * (state.filteredError - state.prevError);
    state.prevError = state.filteredError;

    if (signal > 0 && state.integral < 0) {
        state.integral = 0;
    }

    // Conditional integration anti-windup (industry-standard clamping):
    // Integrate only when the output is NOT saturated, OR when the error is opposing
    // the saturated output (which would naturally unwind it).
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

/**
 * Returns true if the agent has enough deposits to cover at least
 * `EXPANSION_DEPOSIT_THRESHOLD` of the estimated construction cost.
 */
function hasSufficientFundsForExpansion(
    assets: AgentPlanetAssets,
    planet: Planet,
    totalConstructionServiceRequired: number,
): boolean {
    const constructionPrice = planet.marketPrices[constructionServiceResourceType.name] ?? 0;
    if (constructionPrice <= 0) {
        // No price data — cannot estimate cost, skip expansion.
        return false;
    }
    const estimatedCost = totalConstructionServiceRequired * constructionPrice;
    return assets.deposits >= EXPANSION_DEPOSIT_THRESHOLD * estimatedCost;
}

/**
 * Initiate a construction project to expand maxScale.
 * Uses the existing `construction` field and `calculateCostsForConstruction`.
 * Returns true if the expansion was initiated, false if the agent lacks funds.
 */
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

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

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
            // Skip facilities under construction (type === 'new') — they cannot produce yet.
            // Facilities with construction.type === 'expansion' can still produce while expanding.
            if (facility.construction !== null && facility.construction.type === 'new') {
                continue;
            }

            // No market data at all — skip unless there are open bid orders in the order book.
            const hasAnyMarketData = facility.produces.some(
                (o) =>
                    planet.lastMarketResult[o.resource.name] !== undefined ||
                    (planet.orderBooks[o.resource.name]?.bids.length ?? 0) > 0,
            );
            if (!hasAnyMarketData) {
                continue;
            }

            const signal = computeFacilitySignal(facility, assets, planet);
            assert(signal >= -1, 'Signal should be positive due to earlier check for market data, but got' + signal);
            assert(signal <= 1, 'Signal should be capped at 1, but got' + signal);

            // Retrieve or initialise PID state (undefined/null → fresh state).
            const state: PidState = { ...getDefaultPidState(), ...facility.pidState };

            // Compute PID output and apply to scale.
            const delta = computePidDelta(signal, state, facility.maxScale);
            facility.scale = Math.max(facility.maxScale * 0.1, Math.min(facility.maxScale, facility.scale + delta));

            if (facility.scale === facility.maxScale && signal > 0) {
                state.expansionIntegral = Math.min(EXPANSION_INTEGRAL_MAX, state.expansionIntegral + signal);
            } else {
                state.expansionIntegral = Math.max(0, state.expansionIntegral - EXPANSION_INTEGRAL_DECAY);
            }

            // ---- Capacity expansion trigger ----
            if (
                facility.scale >= facility.maxScale &&
                facility.construction === null &&
                state.expansionIntegral >= EXPANSION_INTEGRAL_THRESHOLD &&
                facility.lastTickResults?.overallEfficiency > 0.95
            ) {
                const expanded = initiateCapacityExpansion(facility, assets, planet);
                if (expanded) {
                    state.expansionIntegral = 0;
                }
            }

            // Persist updated PID state back onto the facility (survives snapshot).
            facility.pidState = state;
        }
    });
}
