import { OUTPUT_BUFFER_MAX_TICKS } from '../constants';
import type { PidState, ProductionFacility } from './facility';
import {
    calculateCostsForConstruction,
    getFacilityType,
    MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
    queryStorageFacility,
} from './facility';
import type { Agent, AgentPlanetAssets, Planet } from './planet';
import { constructionServiceResourceType } from './services';

export const OUTPUT_BUFFER_FULL_TICKS = OUTPUT_BUFFER_MAX_TICKS;
export const INPUT_EFFICIENCY_MIN = 0.5;
export const MAX_SCALE_EXPAND_FRACTION = 0.1;
/**
 * Fraction of the estimated construction cost that must be covered by the agent's
 * current deposits before an automated capacity expansion is initiated.
 * 0.5 means the agent needs at least 50% of the estimated cost in deposits.
 */
export const EXPANSION_DEPOSIT_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// PID controller gains and tuning constants
// ---------------------------------------------------------------------------

/** Proportional gain: immediate reaction to current signal. */
export const PID_KP = 0.01;
/** Integral gain: eliminates persistent steady-state offset. */
export const PID_KI = 0.002;
/** Derivative gain: dampens oscillations by braking when error changes. */
export const PID_KD = 0.005;
/**
 * Anti-windup clamp for the integral term (normalised, ×maxScale for absolute).
 * Prevents the integral from accumulating indefinitely when output is saturated.
 */
export const PID_IMAX = 0.5;
/** Maximum scale change per tick (normalised, ×maxScale for absolute). */
export const PID_OUT_MAX = 0.1;
/**
 * Low-pass filter alpha for the derivative error signal.
 * 0.2 = heavy smoothing (derivative is 20% new, 80% old); reduces noise amplification.
 */
export const PID_D_ALPHA = 0.2;

// ---------------------------------------------------------------------------
// Expansion integral constants
// ---------------------------------------------------------------------------

/**
 * Accumulated signal months needed before an automated capacity expansion fires.
 * Prevents expansion on transient demand spikes.
 */
export const EXPANSION_INTEGRAL_THRESHOLD = 12;
/** Anti-windup ceiling for the expansion accumulator. */
export const EXPANSION_INTEGRAL_MAX = 24;
/**
 * Per-call decay applied to the expansion integral when scale < maxScale
 * or signal is not positive — slowly forgets old demand pressure.
 */
export const EXPANSION_INTEGRAL_DECAY = 0.5;

function getDefaultPidState(): PidState {
    return { integral: 0, prevError: 0, filteredError: 0, expansionIntegral: 0 };
}

function computeFacilitySignal(facility: ProductionFacility, assets: AgentPlanetAssets, planet: Planet): number {
    const { lastTickResults, produces, scale } = facility;

    let weightedOutputSignalSum = 0;
    let totalWeight = 0;

    const storage = assets.storageFacility;

    for (const output of produces) {
        const avg = planet.lastMarketResult[output.resource.name];

        if (!avg) {
            continue;
        }

        const orderBook = planet.orderBooks[output.resource.name];
        const price = orderBook?.bids[0]?.price ?? planet.marketPrices[output.resource.name];

        const totalDemand = avg.totalDemand;
        const ownSupply = queryStorageFacility(storage, output.resource.name);
        const perTick = lastTickResults.overallEfficiency * output.quantity * Math.max(scale, 1);
        const buffer = perTick > 0 ? ownSupply / perTick : 0;

        const overfilled =
            buffer >= OUTPUT_BUFFER_FULL_TICKS ? (buffer / (buffer + OUTPUT_BUFFER_FULL_TICKS) - 0.5) * 2 : 0;

        const unfilledFrac = totalDemand > 0 ? avg.unfilledDemand / totalDemand : 0;

        weightedOutputSignalSum += (unfilledFrac - overfilled) * price;
        totalWeight += price;
    }

    if (totalWeight === 0) {
        console.error('No market data for any outputs of facility', facility.id);
        return 0;
    }

    const maxOutputSignal = weightedOutputSignalSum / totalWeight;

    // ---- 2. Output buffer check ----
    // If all output buffers are full (ticksOfInventory above threshold), we consider the buffer "full"
    let outputBufferFull = 0;
    for (const output of produces) {
        const avg = planet.avgMarketResult[output.resource.name];
        // Skip outputs that have no market demand — they're just waste/byproducts
        if (!avg || avg.totalDemand <= 0) {
            continue;
        }
        const inventory = queryStorageFacility(assets.storageFacility, output.resource.name);
        const effectiveScale = Math.max(scale, 1);
        const productionPerTick = output.quantity * effectiveScale;
        const ticksOfInventory = inventory / productionPerTick;
        if (ticksOfInventory >= OUTPUT_BUFFER_FULL_TICKS) {
            outputBufferFull += 1;
        }
    }

    // ---- 3. Profit signal from last tick's costBalance ----
    // costBalance = revenue - consumed input cost (from processProductionFacility).
    // We normalise it relative to a rough "scale * typical revenue" proxy.
    let profitSignal = 0;
    if (lastTickResults) {
        const revenue = Object.entries(lastTickResults.lastProduced ?? {}).reduce((sum, [name, qty]) => {
            const price = planet.lastMarketResult[name]?.clearingPrice ?? planet.marketPrices[name] ?? 0;
            return sum + qty * price;
        }, 0);
        const actualCost = revenue - lastTickResults.costBalance; // costBalance = revenue - actualCost
        const cost = actualCost > 0 ? actualCost : revenue;
        if (cost > 0) {
            // profit margin: (revenue - cost) / cost
            const margin = (revenue - cost) / cost;
            profitSignal = Math.max(-1, Math.min(1, margin));
        }
    }

    // ---- 4. Input efficiency check ----
    // If any input has low resource efficiency, the facility is starved.
    let inputStarved = false;
    if (lastTickResults?.resourceEfficiency) {
        for (const eff of Object.values(lastTickResults.resourceEfficiency)) {
            if (eff < INPUT_EFFICIENCY_MIN) {
                inputStarved = true;
                break;
            }
        }
    }

    // ---- 5. Composite signal ----
    // Weights: demand/supply pressure are primary, profit is secondary.
    // Output buffer full or input starved act as vetoes on scale-up.
    let signal = maxOutputSignal + profitSignal * 0.5;

    // Vetoes
    if (outputBufferFull === produces.length && signal > 0) {
        signal -= 0.1;
    }
    if (inputStarved && signal > 0) {
        signal -= 0.1; // don't scale up when starved of inputs
    }
    if (lastTickResults?.overallEfficiency < 0.85 && signal > 0) {
        signal -= 0.1;
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
    return assets.deposits >= estimatedCost * EXPANSION_DEPOSIT_THRESHOLD;
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

            // No market history for any output — skip.
            const hasAnyMarketData = facility.produces.some((o) => planet.marketPrices[o.resource.name] !== undefined);
            if (!hasAnyMarketData) {
                continue;
            }

            const signal = computeFacilitySignal(facility, assets, planet);

            // Retrieve or initialise PID state (undefined/null → fresh state).
            const state: PidState = { ...getDefaultPidState(), ...facility.pidState };

            // Compute PID output and apply to scale.
            const delta = computePidDelta(signal, state, facility.maxScale);
            facility.scale = Math.max(0, Math.min(facility.maxScale, facility.scale + delta));

            if (facility.scale >= facility.maxScale && signal > 0) {
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
