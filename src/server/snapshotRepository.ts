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
 * Produce a flat row of resolved columns from a Planet object.
 *
 * Instead of storing the entire planet as a monolithic JSONB blob, we extract
 * commonly-queried scalar fields into dedicated columns and keep only the
 * large variable-size data (demography, resources) as JSONB.
 */
const serialisePlanetRow = (planet: Planet) => {
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

    const gov = toAgentRef(planet.government);

    return {
        planet_name: planet.name,
        position: JSON.stringify(planet.position) as unknown as Record<string, unknown>,
        starvation_level: planet.population.starvationLevel ?? 0,
        pollution_air: planet.environment.pollution.air ?? 0,
        pollution_water: planet.environment.pollution.water ?? 0,
        pollution_soil: planet.environment.pollution.soil ?? 0,
        government_id: gov?.id ?? null,
        government_name: gov?.name ?? null,
        infrastructure: JSON.stringify(planet.infrastructure) as unknown as Record<string, unknown>,
        environment: JSON.stringify(planet.environment) as unknown as Record<string, unknown>,
        demography: JSON.stringify(planet.population.demography) as unknown as unknown[],
        resources: JSON.stringify(resources) as unknown as Record<string, unknown>,
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
        population_total: String(computePopulationTotal(planet)),
        ...serialisePlanetRow(planet),
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
        wealth: String(agent.wealth),
        // storage / production / consumption are pre-computed summaries stored as
        // separate columns for efficient time-series queries (no need to parse the
        // full agent JSONB for chart data).
        storage: computeAgentStorage(agent) as Record<string, unknown>,
        production: computeAgentProduction(agent) as Record<string, unknown>,
        consumption: computeAgentConsumption(agent) as Record<string, unknown>,
        // agent_summary stores the full Agent object so the frontend can render
        // detailed facility/worker/storage views without an extra query.
        agent_summary: agent as unknown,
    }));

    await db('agent_snapshots').insert(rows).onConflict(['tick', 'agent_id']).ignore();
};

/**
 * Persist a full GameState snapshot (both planets and agents) for one tick.
 */
export const saveGameStateSnapshot = async (db: Knex, state: GameState): Promise<void> => {
    if (state.tick === 1) {
        await db.raw('TRUNCATE planet_snapshots, agent_snapshots');
    }
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
    planet_name: string;
    position: { x: number; y: number; z: number };
    starvation_level: number;
    pollution_air: number;
    pollution_water: number;
    pollution_soil: number;
    government_id: string | null;
    government_name: string | null;
    infrastructure: object;
    environment: object;
    demography: object;
    resources: object;
};

/**
 * Reconstruct a Planet-like object from resolved snapshot columns.
 * This matches the shape the frontend expects when it casts `snapshot as Planet`.
 */
export const reconstructPlanetFromRow = (row: PlanetSnapshotRow): object => ({
    id: row.planet_id,
    name: row.planet_name,
    position: row.position,
    population: {
        demography: row.demography,
        starvationLevel: row.starvation_level,
    },
    environment: row.environment,
    infrastructure: row.infrastructure,
    government: row.government_id ? { id: row.government_id, name: row.government_name } : null,
    resources: row.resources,
});

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
 * All resolved planet columns we select from the database.
 */
const PLANET_SNAPSHOT_COLUMNS = [
    'tick',
    'planet_id',
    'population_total',
    'planet_name',
    'position',
    'starvation_level',
    'pollution_air',
    'pollution_water',
    'pollution_soil',
    'government_id',
    'government_name',
    'infrastructure',
    'environment',
    'demography',
    'resources',
] as const;

/**
 * Map a raw database row to a typed PlanetSnapshotRow.
 */
const toPlanetSnapshotRow = (r: Record<string, unknown>): PlanetSnapshotRow => ({
    tick: Number(r.tick),
    planet_id: r.planet_id as string,
    population_total: Number(r.population_total),
    planet_name: r.planet_name as string,
    position: r.position as { x: number; y: number; z: number },
    starvation_level: Number(r.starvation_level),
    pollution_air: Number(r.pollution_air),
    pollution_water: Number(r.pollution_water),
    pollution_soil: Number(r.pollution_soil),
    government_id: (r.government_id as string) ?? null,
    government_name: (r.government_name as string) ?? null,
    infrastructure: r.infrastructure as object,
    environment: r.environment as object,
    demography: r.demography as object,
    resources: r.resources as object,
});

/**
 * Return the most recent snapshot for each planet.
 */
export const getLatestPlanetSnapshots = async (db: Knex): Promise<PlanetSnapshotRow[]> => {
    const rows = await db('planet_snapshots')
        .whereIn(
            ['tick', 'planet_id'],
            db('planet_snapshots').select(db.raw('MAX(tick)'), 'planet_id').groupBy('planet_id'),
        )
        .select(...PLANET_SNAPSHOT_COLUMNS);

    return rows.map(toPlanetSnapshotRow);
};

/**
 * Return the most recent snapshot for each agent.
 */
export const getLatestAgentSnapshots = async (db: Knex): Promise<AgentSnapshotRow[]> => {
    const rows = await db('agent_snapshots')
        .whereIn(
            ['tick', 'agent_id'],
            db('agent_snapshots').select(db.raw('MAX(tick)'), 'agent_id').groupBy('agent_id'),
        )
        .select('tick', 'agent_id', 'wealth', 'storage', 'production', 'consumption', 'agent_summary');

    return rows.map((r: Record<string, unknown>) => ({
        tick: Number(r.tick),
        agent_id: r.agent_id as string,
        wealth: Number(r.wealth),
        storage: r.storage as Record<string, number>,
        production: r.production as Record<string, number>,
        consumption: r.consumption as Record<string, number>,
        agent_summary: r.agent_summary as object,
    }));
};

/**
 * Return population history for a specific planet, ordered newest-first.
 */
export const getPlanetPopulationHistory = async (
    db: Knex,
    planetId: string,
    limit = 200,
): Promise<PopulationHistoryPoint[]> => {
    const rows = await db('planet_snapshots')
        .where('planet_id', planetId)
        .orderBy('tick', 'desc')
        .limit(limit)
        .select('tick', 'population_total');

    return rows.map((r: Record<string, unknown>) => ({
        tick: Number(r.tick),
        population_total: Number(r.population_total),
    }));
};

/**
 * Return resource history (storage / production / consumption) for a specific
 * agent, ordered newest-first.
 */
export const getAgentResourceHistory = async (db: Knex, agentId: string, limit = 100): Promise<AgentHistoryPoint[]> => {
    const rows = await db('agent_snapshots')
        .where('agent_id', agentId)
        .orderBy('tick', 'desc')
        .limit(limit)
        .select('tick', 'storage', 'production', 'consumption');

    return rows.map((r: Record<string, unknown>) => ({
        tick: Number(r.tick),
        storage: r.storage as Record<string, number>,
        production: r.production as Record<string, number>,
        consumption: r.consumption as Record<string, number>,
    }));
};
