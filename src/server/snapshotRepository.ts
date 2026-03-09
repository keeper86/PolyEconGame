/**
 * snapshotRepository.ts
 *
 * Repository layer for reading and writing simulation snapshots to the database.
 * Planet and agent state is persisted each tick so the frontend can query
 * only the data it needs rather than receiving the full GameState over SSE.
 */

import type { Planet, Agent } from '../simulation/planet/planet';
import { OCCUPATIONS, SKILL } from '../simulation/population/population';
import { educationLevelKeys } from '../simulation/population/education';

// ---------------------------------------------------------------------------
// Serialisation helpers
// ---------------------------------------------------------------------------

/**
 * Compute the total population for a planet (sum of all cohort occupant counts).
 * New model: demography[age][occ][edu][skill] → PopulationCategory with `.total`.
 */
export const computePopulationTotal = (planet: Planet): number => {
    let total = 0;
    for (const cohort of planet.population.demography) {
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    total += cohort[occ][edu][skill].total;
                }
            }
        }
    }
    return total;
};

/**
 * Compute a weighted-average starvation level across all population categories.
 * Returns 0 when population is empty.
 */
export const computeGlobalStarvation = (planet: Planet): number => {
    let totalStarvation = 0;
    let totalPop = 0;
    for (const cohort of planet.population.demography) {
        if (!cohort) {
            continue;
        }
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    const cat = cohort[occ][edu][skill];
                    if (cat.total > 0) {
                        totalStarvation += cat.starvationLevel * cat.total;
                        totalPop += cat.total;
                    }
                }
            }
        }
    }
    return totalPop > 0 ? totalStarvation / totalPop : 0;
};

/**
 * Compute aggregate resource storage totals for an agent across all planets.
 */
export const computeAgentStorage = (agent: Agent): Record<string, number> => {
    const storage: Record<string, number> = {};
    for (const planetAssets of Object.values(agent.assets)) {
        const stor = planetAssets.storageFacility;
        if (stor?.currentInStorage) {
            for (const [rName, entry] of Object.entries(stor.currentInStorage)) {
                storage[rName] = (storage[rName] || 0) + (entry?.quantity || 0);
            }
        }
    }
    return storage;
};

/**
 * Compute per-tick production totals for an agent (scaled by efficiency).
 */
export const computeAgentProduction = (agent: Agent): Record<string, number> => {
    const production: Record<string, number> = {};
    for (const planetAssets of Object.values(agent.assets)) {
        for (const fac of planetAssets.productionFacilities ?? []) {
            const eff = fac.lastTickResults?.overallEfficiency ?? 0;
            for (const p of fac.produces ?? []) {
                const qty = (p.quantity ?? 0) * fac.scale * eff;
                production[p.resource.name] = (production[p.resource.name] || 0) + qty;
            }
        }
    }
    return production;
};

/**
 * Compute per-tick consumption totals for an agent (scaled by efficiency).
 */
export const computeAgentConsumption = (agent: Agent): Record<string, number> => {
    const consumption: Record<string, number> = {};
    for (const planetAssets of Object.values(agent.assets)) {
        for (const fac of planetAssets.productionFacilities ?? []) {
            const eff = fac.lastTickResults?.overallEfficiency ?? 0;
            for (const n of fac.needs ?? []) {
                const qty = (n.quantity ?? 0) * fac.scale * eff;
                consumption[n.resource.name] = (consumption[n.resource.name] || 0) + qty;
            }
        }
    }
    return consumption;
};

// Note: snapshot persistence (writing and reading historical planet/agent
// snapshots) has been removed. The remaining functions are pure helpers used
// by runtime controller endpoints that rely on the live worker state.

// ---------------------------------------------------------------------------
// Agent list summary (lightweight — no full agent_summary blob)
// ---------------------------------------------------------------------------

/** Shape returned by getAgentListSummaries for each agent. */
export type AgentListSummary = {
    agentId: string;
    name: string;
    associatedPlanetId: string;
    wealth: number;
    facilityCount: number;
    avgEfficiency: number | null;
    totalWorkers: number;
    unusedWorkerFraction: number;
    topResources: Array<{ name: string; quantity: number }>;
    shipCount: number;
};

/**
 * Compute card-level summary data from a full Agent JSONB blob.
 * Runs server-side so only the small summary is sent to the client.
 */
export const summariseAgentBlob = (agentId: string, wealth: number, blob: unknown): AgentListSummary => {
    // blob is the Agent object stored as JSONB
    const a = blob as Agent;

    let facilityCount = 0;
    let efficiencySum = 0;
    let efficiencyN = 0;
    const storageTotals: Record<string, number> = {};
    let totalWorkers = 0;
    let unusedWorkerFraction = 0;

    for (const assets of Object.values(a.assets ?? {})) {
        const facs = assets.productionFacilities ?? [];
        facilityCount += facs.length;
        for (const f of facs) {
            if (f.lastTickResults) {
                efficiencySum += f.lastTickResults.overallEfficiency;
                efficiencyN += 1;
            }
        }

        const stor = assets.storageFacility;
        if (stor?.currentInStorage) {
            for (const [rName, entry] of Object.entries(stor.currentInStorage)) {
                storageTotals[rName] = (storageTotals[rName] || 0) + (entry?.quantity || 0);
            }
        }

        if (assets.allocatedWorkers) {
            for (const v of Object.values(assets.allocatedWorkers)) {
                totalWorkers += (v as number) ?? 0;
            }
        }
        unusedWorkerFraction = Math.max(unusedWorkerFraction, assets.workerFeedback?.unusedWorkerFraction ?? 0);
    }

    const topResources = Object.entries(storageTotals)
        .filter(([, qty]) => qty > 0)
        .sort(([, x], [, y]) => y - x)
        .slice(0, 3)
        .map(([name, quantity]) => ({ name, quantity }));

    return {
        agentId,
        name: a.name ?? agentId,
        associatedPlanetId: a.associatedPlanetId ?? '',
        wealth,
        facilityCount,
        avgEfficiency: efficiencyN > 0 ? efficiencySum / efficiencyN : null,
        totalWorkers,
        unusedWorkerFraction,
        topResources,
        shipCount: a.transportShips?.length ?? 0,
    };
};

/**
 * Return lightweight summary data for every agent (latest tick only).
 * Fetches the full agent_summary JSONB but computes the summary server-side
 * so only a small payload is sent to the client.
 */
// getAgentListSummaries/read helpers removed — compute summaries from live
// Agent objects instead of DB snapshots. Keep summariseAgentBlob for use by
// controller code that operates on live agent objects.

// Single-agent DB detail helper removed — callers should use the live worker
// Agent object instead of querying historical snapshots.

// ---------------------------------------------------------------------------
// Agent overview (top-level stats + per-planet summaries)
// ---------------------------------------------------------------------------

/** Per-planet summary returned by getAgentOverview. */
export type AgentPlanetSummary = {
    planetId: string;
    deposits: number;
    facilityCount: number;
    avgEfficiency: number | null;
    totalWorkers: number;
    unusedWorkerFraction: number;
    topResources: Array<{ name: string; quantity: number }>;
};

/** Shape returned by getAgentOverview. */
export type AgentOverviewData = {
    agentId: string;
    name: string;
    associatedPlanetId: string;
    wealth: number;
    /** Firm deposit balance (currency units). 0 when not yet set by the financial tick. */
    deposits: number;
    shipCount: number;
    planets: AgentPlanetSummary[];
};

/**
 * Summarise a single planet's assets from the Agent JSONB blob.
 */
export const summarisePlanetAssets = (planetId: string, assets: Agent['assets'][string]): AgentPlanetSummary => {
    let facilityCount = 0;
    let efficiencySum = 0;
    let efficiencyN = 0;
    const storageTotals: Record<string, number> = {};
    let totalWorkers = 0;

    const facs = assets.productionFacilities ?? [];
    facilityCount = facs.length;
    for (const f of facs) {
        if (f.lastTickResults) {
            efficiencySum += f.lastTickResults.overallEfficiency;
            efficiencyN += 1;
        }
    }

    const stor = assets.storageFacility;
    if (stor?.currentInStorage) {
        for (const [rName, entry] of Object.entries(stor.currentInStorage)) {
            storageTotals[rName] = (storageTotals[rName] || 0) + (entry?.quantity || 0);
        }
    }

    if (assets.allocatedWorkers) {
        for (const v of Object.values(assets.allocatedWorkers)) {
            totalWorkers += (v as number) ?? 0;
        }
    }

    const topResources = Object.entries(storageTotals)
        .filter(([, qty]) => qty > 0)
        .sort(([, x], [, y]) => y - x)
        .slice(0, 3)
        .map(([name, quantity]) => ({ name, quantity }));

    return {
        planetId,
        facilityCount,
        deposits: assets.deposits,
        avgEfficiency: efficiencyN > 0 ? efficiencySum / efficiencyN : null,
        totalWorkers,
        unusedWorkerFraction: assets.workerFeedback?.unusedWorkerFraction ?? 0,
        topResources,
    };
};

/**
 * Return overview data for a single agent: top-level stats plus per-planet
 * summaries.  Computes everything server-side from the agent_summary JSONB
 * so only a lightweight payload is sent to the client.
 */
// getAgentOverview removed — callers should compute overview data from the
// live Agent object provided by the worker.

// ---------------------------------------------------------------------------
// Agent planet detail (full assets for one agent on one planet)
// ---------------------------------------------------------------------------

/** Shape returned by getAgentPlanetDetail. */
export type AgentPlanetDetailData = {
    agentId: string;
    agentName: string;
    planetId: string;
    /** The full per-planet assets object, passed as-is so the UI can render
     *  facilities, workforce demography, storage, etc. */
    assets: Agent['assets'][string];
};

/**
 * Return the full per-planet assets for a single agent on a single planet.
 * Extracts from the agent_summary JSONB blob server-side and returns only
 * the relevant planet slice.
 */
// getAgentPlanetDetail removed — callers should query the live Agent blob
// and extract per-planet assets from it.

/**
 * Return resource history (storage / production / consumption) for a specific
 * agent, ordered newest-first.
 */
// historical agent resource queries removed.
