import { queryStorageFacility } from './storage';
import { agriculturalProductResourceType } from './resources';
import type { Agent, Planet } from './planet';
import type { ProductionFacility } from './storage';

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

    const sellOffers = assets.market?.sell;
    if (!sellOffers || Object.keys(sellOffers).length === 0) {
        return;
    }

    const lastSold = Object.values(sellOffers).reduce((max, offer) => Math.max(max, offer.lastSold ?? 0), 0);
    if (lastSold === 0) {
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
