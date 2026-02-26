/**
 * snapshotRepository.ts
 *
 * Repository layer for reading and writing simulation snapshots to the database.
 * Planet and agent state is persisted each tick so the frontend can query
 * only the data it needs rather than receiving the full GameState over SSE.
 */

import type { Knex } from 'knex';
import type { Planet, Agent } from '../simulation/planet';
import type { GameState } from '../simulation/engine';

// ---------------------------------------------------------------------------
// Serialisation helpers
// ---------------------------------------------------------------------------

/**
 * A minimal agent reference used in place of the full Agent object inside
 * planet resource claims, to keep snapshot JSON size small.
 */
type AgentRef = { id: string; name: string } | null;

/**
 * Convert an Agent (or null) to a minimal {id, name} reference.
 */
const toAgentRef = (agent: Agent | null | undefined): AgentRef => {
    if (!agent) {
        return null;
    }
    return { id: agent.id, name: agent.name };
};

/**
 * Produce a JSON-safe planet snapshot.
 *
 * Replaces nested Agent objects (government, resource claim/tenant) with
 * minimal {id, name} references to avoid bloated JSONB storage.
 */
const serialisePlanet = (planet: Planet): object => {
    const resources: Record<string, unknown[]> = {};
    for (const [resourceName, entries] of Object.entries(planet.resources)) {
        resources[resourceName] = entries.map((entry) => ({
            id: entry.id,
            type: entry.type,
            quantity: entry.quantity,
            regenerationRate: entry.regenerationRate,
            maximumCapacity: entry.maximumCapacity,
            tenantCostInCoins: entry.tenantCostInCoins,
            claim: toAgentRef(entry.claim),
            tenant: toAgentRef(entry.tenant),
        }));
    }

    return {
        id: planet.id,
        name: planet.name,
        position: planet.position,
        population: planet.population,
        environment: planet.environment,
        infrastructure: planet.infrastructure,
        government: toAgentRef(planet.government),
        resources,
    };
};

/**
 * Compute the total population for a planet (sum of all cohort occupant counts).
 */
const computePopulationTotal = (planet: Planet): number => {
    let total = 0;
    for (const cohort of planet.population.demography) {
        for (const eduObj of Object.values(cohort)) {
            for (const occVal of Object.values(eduObj)) {
                total += Number(occVal) || 0;
            }
        }
    }
    return total;
};

/**
 * Compute aggregate resource storage totals for an agent across all planets.
 */
const computeAgentStorage = (agent: Agent): Record<string, number> => {
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
const computeAgentProduction = (agent: Agent): Record<string, number> => {
    const production: Record<string, number> = {};
    for (const planetAssets of Object.values(agent.assets)) {
        for (const fac of planetAssets.productionFacilities ?? []) {
            const eff = (fac.lastTickEfficiencyInPercent ?? 0) / 100;
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
const computeAgentConsumption = (agent: Agent): Record<string, number> => {
    const consumption: Record<string, number> = {};
    for (const planetAssets of Object.values(agent.assets)) {
        for (const fac of planetAssets.productionFacilities ?? []) {
            const eff = (fac.lastTickEfficiencyInPercent ?? 0) / 100;
            for (const n of fac.needs ?? []) {
                const qty = (n.quantity ?? 0) * fac.scale * eff;
                consumption[n.resource.name] = (consumption[n.resource.name] || 0) + qty;
            }
        }
    }
    return consumption;
};

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Persist planet snapshots for all planets in the given GameState tick.
 * Uses INSERT … ON CONFLICT DO NOTHING to be idempotent per (tick, planet_id).
 */
export const savePlanetSnapshots = async (db: Knex, tick: number, planets: Planet[]): Promise<void> => {
    const rows = planets.map((planet) => ({
        tick,
        planet_id: planet.id,
        population_total: computePopulationTotal(planet),
        snapshot: serialisePlanet(planet) as object,
    }));

    await db('planet_snapshots').insert(rows).onConflict(['tick', 'planet_id']).ignore();
};

/**
 * Persist agent snapshots for all agents in the given GameState tick.
 * Uses INSERT … ON CONFLICT DO NOTHING to be idempotent per (tick, agent_id).
 */
export const saveAgentSnapshots = async (db: Knex, tick: number, agents: Agent[]): Promise<void> => {
    const rows = agents.map((agent) => ({
        tick,
        agent_id: agent.id,
        wealth: agent.wealth,
        storage: computeAgentStorage(agent) as object,
        production: computeAgentProduction(agent) as object,
        consumption: computeAgentConsumption(agent) as object,
        agent_summary: agent as unknown as object,
    }));

    await db('agent_snapshots').insert(rows).onConflict(['tick', 'agent_id']).ignore();
};

/**
 * Persist a full GameState snapshot (both planets and agents) for one tick.
 */
export const saveGameStateSnapshot = async (db: Knex, state: GameState): Promise<void> => {
    await Promise.all([
        savePlanetSnapshots(db, state.tick, state.planets),
        saveAgentSnapshots(db, state.tick, state.agents),
    ]);
};

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export type PlanetSnapshotRow = {
    tick: number;
    planet_id: string;
    population_total: number;
    snapshot: object;
};

export type AgentSnapshotRow = {
    tick: number;
    agent_id: string;
    wealth: number;
    storage: Record<string, number>;
    production: Record<string, number>;
    consumption: Record<string, number>;
    agent_summary: object;
};

export type PopulationHistoryPoint = {
    tick: number;
    population_total: number;
};

export type AgentHistoryPoint = {
    tick: number;
    storage: Record<string, number>;
    production: Record<string, number>;
    consumption: Record<string, number>;
};

/**
 * Return the most recent snapshot for each planet.
 */
export const getLatestPlanetSnapshots = async (db: Knex): Promise<PlanetSnapshotRow[]> => {
    return db('planet_snapshots')
        .whereIn(
            ['tick', 'planet_id'],
            db('planet_snapshots').select(db.raw('MAX(tick)'), 'planet_id').groupBy('planet_id'),
        )
        .select('tick', 'planet_id', 'population_total', 'snapshot') as Promise<PlanetSnapshotRow[]>;
};

/**
 * Return the most recent snapshot for each agent.
 */
export const getLatestAgentSnapshots = async (db: Knex): Promise<AgentSnapshotRow[]> => {
    return db('agent_snapshots')
        .whereIn(
            ['tick', 'agent_id'],
            db('agent_snapshots').select(db.raw('MAX(tick)'), 'agent_id').groupBy('agent_id'),
        )
        .select('tick', 'agent_id', 'wealth', 'storage', 'production', 'consumption', 'agent_summary') as Promise<
        AgentSnapshotRow[]
    >;
};

/**
 * Return population history for a specific planet, ordered newest-first.
 */
export const getPlanetPopulationHistory = async (
    db: Knex,
    planetId: string,
    limit = 200,
): Promise<PopulationHistoryPoint[]> => {
    return db('planet_snapshots')
        .where('planet_id', planetId)
        .orderBy('tick', 'desc')
        .limit(limit)
        .select('tick', 'population_total') as Promise<PopulationHistoryPoint[]>;
};

/**
 * Return resource history (storage / production / consumption) for a specific
 * agent, ordered newest-first.
 */
export const getAgentResourceHistory = async (
    db: Knex,
    agentId: string,
    limit = 100,
): Promise<AgentHistoryPoint[]> => {
    return db('agent_snapshots')
        .where('agent_id', agentId)
        .orderBy('tick', 'desc')
        .limit(limit)
        .select('tick', 'storage', 'production', 'consumption') as Promise<AgentHistoryPoint[]>;
};
