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
    // Use a bucketing approach to sample up to `limit` rows evenly across the
    // planet's full history (newest-first). This buckets rows by their
    // row-number (ordered by tick DESC) and picks the newest row per bucket.
    // It's deterministic and avoids returning only the most recent `limit`
    // rows when the history is longer than `limit`.
    const sql = `
        WITH numbered AS (
            SELECT ps.tick, ps.population_total,
                         row_number() OVER (ORDER BY tick DESC) - 1 AS rn,
                         count(*) OVER() AS cnt
            FROM planet_snapshots ps
            WHERE planet_id = ?
        ), bucketed AS (
            SELECT n.*, floor(n.rn::double precision * ?::double precision / GREATEST(n.cnt,1)::double precision) AS bucket
            FROM numbered n
        ), chosen AS (
            SELECT DISTINCT ON (bucket) bucket, tick, population_total
            FROM bucketed
            ORDER BY bucket, tick DESC
        )
        SELECT tick, population_total FROM chosen ORDER BY bucket ASC;
        `;

    const raw = await db.raw(sql, [planetId, limit]);
    // knex/pg returns rows in different shapes depending on the client wrapper
    const resultRows = (raw.rows ?? raw) as Array<Record<string, unknown>>;

    return resultRows.map((r) => ({
        tick: Number(r.tick),
        population_total: Number(r.population_total),
    }));
};

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
const summariseAgentBlob = (agentId: string, wealth: number, blob: unknown): AgentListSummary => {
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
        unusedWorkerFraction = Math.max(unusedWorkerFraction, assets.unusedWorkerFraction ?? 0);
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
export const getAgentListSummaries = async (db: Knex): Promise<{ tick: number; agents: AgentListSummary[] }> => {
    const rows = await db('agent_snapshots')
        .whereIn(
            ['tick', 'agent_id'],
            db('agent_snapshots').select(db.raw('MAX(tick)'), 'agent_id').groupBy('agent_id'),
        )
        .select('tick', 'agent_id', 'wealth', 'agent_summary');

    const tick = rows.length > 0 ? Math.max(...rows.map((r: Record<string, unknown>) => Number(r.tick))) : 0;
    const agents = rows.map((r: Record<string, unknown>) =>
        summariseAgentBlob(r.agent_id as string, Number(r.wealth), r.agent_summary),
    );
    return { tick, agents };
};

// ---------------------------------------------------------------------------
// Single agent detail (full Agent blob for one agent)
// ---------------------------------------------------------------------------

/** Shape returned by getLatestAgentSnapshot. */
export type AgentDetailRow = AgentSnapshotRow;

/**
 * Return the latest snapshot for a single agent by ID.
 * Returns `undefined` if the agent is not found.
 */
export const getLatestAgentSnapshot = async (db: Knex, agentId: string): Promise<AgentDetailRow | undefined> => {
    const row = await db('agent_snapshots')
        .where('agent_id', agentId)
        .orderBy('tick', 'desc')
        .first('tick', 'agent_id', 'wealth', 'storage', 'production', 'consumption', 'agent_summary');

    if (!row) {
        return undefined;
    }

    const r = row as Record<string, unknown>;
    return {
        tick: Number(r.tick),
        agent_id: r.agent_id as string,
        wealth: Number(r.wealth),
        storage: r.storage as Record<string, number>,
        production: r.production as Record<string, number>,
        consumption: r.consumption as Record<string, number>,
        agent_summary: r.agent_summary as object,
    };
};

// ---------------------------------------------------------------------------
// Agent overview (top-level stats + per-planet summaries)
// ---------------------------------------------------------------------------

/** Per-planet summary returned by getAgentOverview. */
export type AgentPlanetSummary = {
    planetId: string;
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
    shipCount: number;
    planets: AgentPlanetSummary[];
};

/**
 * Summarise a single planet's assets from the Agent JSONB blob.
 */
const summarisePlanetAssets = (planetId: string, assets: Agent['assets'][string]): AgentPlanetSummary => {
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
        avgEfficiency: efficiencyN > 0 ? efficiencySum / efficiencyN : null,
        totalWorkers,
        unusedWorkerFraction: assets.unusedWorkerFraction ?? 0,
        topResources,
    };
};

/**
 * Return overview data for a single agent: top-level stats plus per-planet
 * summaries.  Computes everything server-side from the agent_summary JSONB
 * so only a lightweight payload is sent to the client.
 */
export const getAgentOverview = async (
    db: Knex,
    agentId: string,
): Promise<{ tick: number; overview: AgentOverviewData | null }> => {
    const row = await db('agent_snapshots')
        .where('agent_id', agentId)
        .orderBy('tick', 'desc')
        .first('tick', 'agent_id', 'wealth', 'agent_summary');

    if (!row) {
        return { tick: 0, overview: null };
    }

    const r = row as Record<string, unknown>;
    const tick = Number(r.tick);
    const a = r.agent_summary as Agent;

    const planets: AgentPlanetSummary[] = Object.entries(a.assets ?? {}).map(([planetId, assets]) =>
        summarisePlanetAssets(planetId, assets),
    );

    return {
        tick,
        overview: {
            agentId: a.id ?? (r.agent_id as string),
            name: a.name ?? (r.agent_id as string),
            associatedPlanetId: a.associatedPlanetId ?? '',
            wealth: Number(r.wealth),
            shipCount: a.transportShips?.length ?? 0,
            planets,
        },
    };
};

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
export const getAgentPlanetDetail = async (
    db: Knex,
    agentId: string,
    planetId: string,
): Promise<{ tick: number; detail: AgentPlanetDetailData | null }> => {
    const row = await db('agent_snapshots')
        .where('agent_id', agentId)
        .orderBy('tick', 'desc')
        .first('tick', 'agent_id', 'agent_summary');

    if (!row) {
        return { tick: 0, detail: null };
    }

    const r = row as Record<string, unknown>;
    const tick = Number(r.tick);
    const a = r.agent_summary as Agent;
    const assets = a.assets?.[planetId];

    if (!assets) {
        return { tick, detail: null };
    }

    return {
        tick,
        detail: {
            agentId: a.id ?? (r.agent_id as string),
            agentName: a.name ?? (r.agent_id as string),
            planetId,
            assets,
        },
    };
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
