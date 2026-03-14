/**
 * planet/agentProduction.ts
 *
 * Markovian production-scale management for agents.
 *
 * The agent's decision depends only on the **current observable state**:
 *
 *   inventory  — tons of food currently in storage
 *   lastSold   — tons sold in the most recent market tick
 *
 * These two numbers are sufficient statistics for the supply/demand
 * imbalance; no historical accumulation is required.
 *
 * Policy: inventory-gap base-stock rule
 * ─────────────────────────────────────
 * Each scale unit produces `outputPerScaleUnit` tons per tick.  The agent
 * wants to hold roughly `INVENTORY_TARGET_TICKS` ticks-worth of demand as
 * a buffer above the amount it is about to produce.
 *
 *   targetInventory = lastSold × INVENTORY_TARGET_TICKS
 *   gap             = targetInventory − inventory          (negative = excess)
 *   requiredOutput  = lastSold + gap                       (clamp to ≥ 0)
 *   desiredScale    = ceil(requiredOutput / outputPerScaleUnit)
 *
 * Scale is then clamped to the integer range [SCALE_MIN, facility.maxScale].
 *
 * Properties
 * ──────────
 * • Purely Markovian — no counters, no history on the facility object.
 * • Naturally asymmetric: excess inventory (gap < 0) drives scale down;
 *   deficit inventory (gap > 0) drives scale up.
 * • Self-stabilising: once inventory converges to the target band the
 *   desired scale equals the previous scale → no further change.
 */

import { agriculturalProductResourceType, queryStorageFacility } from './facilities';
import type { Agent, Planet } from './planet';
import type { ProductionFacility } from './facilities';

// ---------------------------------------------------------------------------
// Tuneable constants
// ---------------------------------------------------------------------------

/**
 * How many ticks of recent sales the agent wants to keep as a buffer.
 * 30 ticks ≈ one month of demand.  Lower values make the agent leaner
 * (less buffer, more responsive); higher values make it more conservative.
 */
export const INVENTORY_TARGET_TICKS = 60;

/**
 * Minimum integer scale.  Keeps at least one unit of capacity online so
 * the agent never disappears from the market entirely.
 */
export const SCALE_MIN = 1;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function updateAgentProductionScale(agents: Map<string, Agent>, planet: Planet): void {
    for (const agent of agents.values()) {
        updateProductionScaleForAgent(agent, planet);
    }
}

// ---------------------------------------------------------------------------
// Per-agent logic
// ---------------------------------------------------------------------------

function updateProductionScaleForAgent(agent: Agent, planet: Planet): void {
    const assets = agent.assets[planet.id];
    if (!assets) {
        return;
    }

    // We need a demand signal.
    const lastSold = assets.foodMarket?.lastSold;
    if (lastSold === undefined) {
        return;
    }

    const inventory = queryStorageFacility(assets.storageFacility, agriculturalProductResourceType.name);

    for (const facility of assets.productionFacilities) {
        adjustFacilityScale(facility, inventory, lastSold);
    }
}

function adjustFacilityScale(facility: ProductionFacility, inventory: number, lastSold: number): void {
    // Output this facility produces per tick at scale = 1.
    const outputPerScaleUnit = facility.produces.reduce(
        (sum, p) => (p.resource.name === agriculturalProductResourceType.name ? sum + p.quantity : sum),
        0,
    );

    // Non-food facilities are not managed here.
    if (outputPerScaleUnit <= 0) {
        return;
    }

    // Target buffer: we want to hold this many tons in stock.
    const targetInventory = lastSold * INVENTORY_TARGET_TICKS;

    // Gap: positive means we are below target (need to produce more);
    //      negative means we have excess inventory (produce less).
    const gap = targetInventory - inventory;

    // Required output = cover this tick's demand + close the gap.
    // Clamped to ≥ 0 so we never "un-produce".
    const requiredOutput = Math.max(0, lastSold + gap);

    // Convert to integer scale units, always at least SCALE_MIN.
    const desiredScale = Math.max(SCALE_MIN, Math.ceil(requiredOutput / outputPerScaleUnit));

    facility.scale = Math.min(facility.maxScale, desiredScale);
}
