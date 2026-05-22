import { OUTPUT_BUFFER_MAX_TICKS } from '../constants';
import type { ProductionFacility } from './facility';
import {
    calculateCostsForConstruction,
    getFacilityType,
    MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
    queryStorageFacility,
} from './facility';
import type { Agent, AgentPlanetAssets, Planet } from './planet';

export const PROD_SCALE_BASE_STEP = 0.01;
export const OUTPUT_BUFFER_FULL_TICKS = OUTPUT_BUFFER_MAX_TICKS;
export const INPUT_EFFICIENCY_MIN = 0.5;
export const PROD_SCALE_SIGNAL_THRESHOLD = 0.5;
export const MAX_SCALE_EXPAND_FRACTION = 0.1;

function computeFacilitySignal(facility: ProductionFacility, assets: AgentPlanetAssets, planet: Planet): number {
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
        const effectiveScale = Math.max(scale, 1);
        const productionPerTick = output.quantity * effectiveScale;
        const ticksOfInventory = inventory / productionPerTick;
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
    let signal = demandPressure - supplyPressure + profitSignal * 0.5;

    // Vetoes
    if (outputBufferFull) {
        signal = Math.min(signal, -PROD_SCALE_SIGNAL_THRESHOLD * 0.5);
    }
    if (inputStarved && signal > 0) {
        signal = 0; // don't scale up when starved of inputs
    }
    if (lastTickResults?.overallEfficiency < 0.85 && signal > 0) {
        signal = 0;
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
    const targetMax = Math.max(Math.ceil(currentMax * (1 + MAX_SCALE_EXPAND_FRACTION)), currentMax + 1);
    const facilityType = getFacilityType(facility);
    const totalCost = calculateCostsForConstruction(facilityType, currentMax, targetMax);

    facility.construction = {
        type: 'expansion',
        constructionTargetMaxScale: targetMax,
        totalConstructionServiceRequired: totalCost,
        maximumConstructionServiceConsumption: totalCost / MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
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
            // Skip facilities under construction (type === 'new') — they cannot produce yet.
            // Facilities with construction.type === 'expansion' can still produce while expanding.
            if (facility.construction !== null && facility.construction.type === 'new') {
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
                if (
                    facility.scale >= facility.maxScale &&
                    facility.construction === null &&
                    facility.lastTickResults?.overallEfficiency > 0.95
                ) {
                    // At capacity and no construction in progress — start a construction project to expand.
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
