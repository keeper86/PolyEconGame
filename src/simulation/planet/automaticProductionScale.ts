import { OUTPUT_BUFFER_MAX_TICKS } from '../constants';
import type { ProductionFacility } from './facility';
import { queryStorageFacility } from './facility';
import type { Agent, Planet } from './planet';
import { calculateCostsForConstruction, getFacilityType } from './facility';

// ---------------------------------------------------------------------------
// Exported constants (tunable)
// ---------------------------------------------------------------------------

/**
 * Base fraction of maxScale that can be adjusted per month when the signal is
 * at full strength.  The actual step is `baseStep * |signal| * scale`, so
 * strong signals move faster and weak signals barely move.
 */
export const PROD_SCALE_BASE_STEP = 0.05;

/**
 * If any output's inventory exceeds this many ticks' worth of production,
 * the facility is considered "output buffer near full" and scale-up is blocked.
 */
export const OUTPUT_BUFFER_FULL_TICKS = OUTPUT_BUFFER_MAX_TICKS;

/**
 * If any input's resource efficiency (from lastTickResults) is below this
 * threshold, scale-up is blocked (the facility is starved of that input).
 */
export const INPUT_EFFICIENCY_MIN = 0.5;

/**
 * Signal threshold for action.  When the weighted composite signal exceeds
 * this magnitude, a scale adjustment is made.
 */
export const PROD_SCALE_SIGNAL_THRESHOLD = 0.3;

/**
 * Maximum fraction by which maxScale can be expanded in a single construction
 * project (e.g. 0.25 = 25% increase).
 */
export const MAX_SCALE_EXPAND_FRACTION = 0.25;

/**
 * Maximum construction service consumption per tick for a capacity-expansion
 * project.  This limits how fast construction progresses.
 */
export const MAX_CONSTRUCTION_SERVICE_CONSUMPTION = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute a composite production-steering signal for a single facility.
 *
 * Returns a value in roughly [-1, +1] where:
 *   > 0  → pressure to scale up
 *   < 0  → pressure to scale down
 *   near 0 → hold steady
 */
function computeFacilitySignal(
    facility: ProductionFacility,
    assets: NonNullable<Agent['assets'][string]>,
    planet: Planet,
): number {
    const { lastTickResults, produces, scale } = facility;

    // ---- 1. Demand / supply pressure from market aggregates ----
    let demandPressure = 0;
    let supplyPressure = 0;
    let outputCount = 0;

    for (const output of produces) {
        const avg = planet.avgMarketResult[output.resource.name];
        if (!avg) {
            continue;
        }
        const totalDemand = avg.totalDemand;
        const totalSupply = avg.totalSupply;

        const unfilledFrac = totalDemand > 0 ? avg.unfilledDemand / totalDemand : 0;
        const unsoldFrac = totalSupply > 0 ? avg.unsoldSupply / totalSupply : 0;

        demandPressure += unfilledFrac;
        supplyPressure += unsoldFrac;
        outputCount++;
    }

    if (outputCount > 0) {
        demandPressure /= outputCount;
        supplyPressure /= outputCount;
    }

    // ---- 2. Output buffer check ----
    // If any output's inventory is near-full, that's a strong scale-down signal.
    let outputBufferFull = false;
    for (const output of produces) {
        const inventory = queryStorageFacility(assets.storageFacility, output.resource.name);
        const productionPerTick = output.quantity * scale;
        const ticksOfInventory = productionPerTick > 0 ? inventory / productionPerTick : Infinity;
        if (ticksOfInventory >= OUTPUT_BUFFER_FULL_TICKS) {
            outputBufferFull = true;
            break;
        }
    }

    // ---- 3. Profit signal from last tick's costBalance ----
    // costBalance = revenue - consumed input cost (from processProductionFacility).
    // We normalise it relative to a rough "scale * typical revenue" proxy.
    let profitSignal = 0;
    if (lastTickResults) {
        const revenue = Object.entries(lastTickResults.lastProduced ?? {}).reduce((sum, [name, qty]) => {
            const price = planet.avgMarketResult[name]?.clearingPrice ?? planet.marketPrices[name] ?? 0;
            return sum + qty * price;
        }, 0);
        const totalCost = Math.abs(lastTickResults.costBalance) + revenue; // costBalance = revenue - cost
        const cost = totalCost > 0 ? totalCost : revenue;
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
    let signal = demandPressure - supplyPressure + profitSignal * 0.5;

    // Vetoes
    if (outputBufferFull) {
        signal = Math.min(signal, -PROD_SCALE_SIGNAL_THRESHOLD * 0.5);
    }
    if (inputStarved && signal > 0) {
        signal = 0; // don't scale up when starved of inputs
    }

    return signal;
}

/**
 * Adjust `facility.scale` by a step proportional to `signal` strength.
 * Returns the actual delta applied.
 */
function adjustScale(facility: ProductionFacility, signal: number): number {
    const stepMagnitude = PROD_SCALE_BASE_STEP * Math.abs(signal) * facility.maxScale;
    const delta = signal > 0 ? stepMagnitude : -stepMagnitude;
    const newScale = Math.max(0, Math.min(facility.maxScale, facility.scale + delta));
    const applied = newScale - facility.scale;
    facility.scale = newScale;
    return applied;
}

/**
 * Initiate a construction project to expand maxScale.
 * Uses the existing `construction` field and `calculateCostsForConstruction`.
 */
function initiateCapacityExpansion(facility: ProductionFacility): void {
    const currentMax = facility.maxScale;
    const targetMax = currentMax * (1 + MAX_SCALE_EXPAND_FRACTION);
    const facilityType = getFacilityType(facility);
    const totalCost = calculateCostsForConstruction(facilityType, currentMax, targetMax);

    facility.construction = {
        constructionTargetMaxScale: targetMax,
        totalConstructionServiceRequired: totalCost,
        maximumConstructionServiceConsumption: MAX_CONSTRUCTION_SERVICE_CONSUMPTION,
        progress: 0,
        lastTickInvestedConstructionServices: 0,
    };
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
            // Skip facilities under construction (they can't change scale while building).
            if (facility.construction !== null) {
                continue;
            }

            // No market history for any output — skip.
            const hasAnyMarketData = facility.produces.some(
                (o) => planet.avgMarketResult[o.resource.name] !== undefined,
            );
            if (!hasAnyMarketData) {
                continue;
            }

            const signal = computeFacilitySignal(facility, assets, planet);

            if (signal > PROD_SCALE_SIGNAL_THRESHOLD) {
                // Scale up
                if (facility.scale >= facility.maxScale) {
                    // At capacity — start a construction project to expand.
                    initiateCapacityExpansion(facility);
                } else {
                    adjustScale(facility, signal);
                }
            } else if (signal < -PROD_SCALE_SIGNAL_THRESHOLD) {
                // Scale down (never shrink maxScale — scale can go to 0).
                adjustScale(facility, signal);
            }
            // else: signal in deadband → no action
        }
    });
}
