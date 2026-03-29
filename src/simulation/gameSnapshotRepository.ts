/**
 * server/gameSnapshotRepository.ts
 *
 * Repository layer for reading and writing sparse cold game snapshots
 * and planet population history.
 *
 * Cold snapshots: MessagePack-serialized blobs of the full GameState,
 * stored periodically (e.g. every 360 ticks) for crash recovery.
 *
 * Population history: lightweight rows (tick | planet_id | population)
 * written alongside each cold snapshot so long-term population trends
 * can be queried without deserializing the full blob.
 */

import type { Knex } from 'knex';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GameSnapshotRow {
    id: string; // bigserial comes back as string from pg
    tick: string; // bigint comes back as string from pg
    created_at: Date;
    game_id: number;
    snapshot_data: Buffer;
}

export interface InsertGameSnapshot {
    tick: number;
    /** Optional game id for multi-game setups. Defaults to 1. */
    game_id?: number;
    snapshot_data: Buffer;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Insert a new cold snapshot row.
 */
export async function insertGameSnapshot(db: Knex, snapshot: InsertGameSnapshot): Promise<void> {
    await db('game_snapshots').insert({
        tick: String(snapshot.tick),
        game_id: snapshot.game_id ?? 1,
        snapshot_data: snapshot.snapshot_data,
    });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Get the most recent cold snapshot (by tick DESC).
 * Returns `null` if no snapshots exist.
 */
export async function getLatestGameSnapshot(db: Knex): Promise<GameSnapshotRow | null> {
    const row = await db('game_snapshots').orderBy('tick', 'desc').first();
    return (row as GameSnapshotRow) ?? null;
}

/**
 * Get a snapshot for a specific tick.
 */
export async function getGameSnapshotByTick(db: Knex, tick: number): Promise<GameSnapshotRow | null> {
    const row = await db('game_snapshots')
        .where({ tick: String(tick) })
        .first();
    return (row as GameSnapshotRow) ?? null;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Delete all snapshots except the N most recent (by tick DESC).
 * Useful for keeping the table small.
 */
export async function pruneGameSnapshots(db: Knex, keepCount: number): Promise<number> {
    if (keepCount <= 0) {
        return 0;
    }

    // Get the tick of the Nth most recent snapshot
    const rows = await db('game_snapshots').orderBy('tick', 'desc').limit(keepCount).select('tick');

    if (rows.length < keepCount) {
        // Fewer snapshots than keepCount — nothing to prune.
        return 0;
    }

    const cutoffTick = Number(rows[rows.length - 1].tick);

    const deleted = await db('game_snapshots').where('tick', '<', cutoffTick).del();
    return deleted;
}

// ---------------------------------------------------------------------------
// Planet population history
// ---------------------------------------------------------------------------

export interface PlanetPopulationHistoryRow {
    id: string; // bigserial comes back as string from pg
    tick: string; // bigint comes back as string from pg
    planet_id: string;
    population: string; // bigint comes back as string from pg
    starvation_level: number; // float4 comes back as number from pg
    food_price: number; // float4 comes back as number from pg
    created_at: Date;
}

export interface InsertPlanetPopulation {
    tick: number;
    planet_id: string;
    population: number;
    starvation_level: number;
    food_price: number;
}

/**
 * Insert one population-history row per planet for a given tick.
 * Uses a single multi-row insert for efficiency.
 */
export async function insertPlanetPopulationHistory(db: Knex, rows: InsertPlanetPopulation[]): Promise<void> {
    if (rows.length === 0) {
        return;
    }
    await db('planet_population_history').insert(
        rows.map((r) => ({
            tick: String(r.tick),
            planet_id: r.planet_id,
            population: String(r.population),
            starvation_level: r.starvation_level,
            food_price: r.food_price,
        })),
    );
}

/**
 * Get the full population time-series for a specific planet, ordered by
 * tick ascending.
 */
export async function getPlanetPopulationHistory(db: Knex, planetId: string): Promise<PlanetPopulationHistoryRow[]> {
    return db('planet_population_history')
        .where({ planet_id: planetId })
        .orderBy('tick', 'desc')
        .limit(100)
        .select() as Promise<PlanetPopulationHistoryRow[]>;
}

/**
 * Get the most recent population row for every planet (latest tick).
 */
export async function getLatestPlanetPopulations(db: Knex): Promise<PlanetPopulationHistoryRow[]> {
    // Use a DISTINCT ON query to efficiently fetch the latest row per planet.
    return db
        .raw(
            `SELECT DISTINCT ON (planet_id) *
         FROM planet_population_history
         ORDER BY planet_id, tick DESC`,
        )
        .then((res: { rows: PlanetPopulationHistoryRow[] }) => res.rows);
}

// ---------------------------------------------------------------------------
// Agent monthly history
// ---------------------------------------------------------------------------

export interface AgentMonthlyHistoryRow {
    id: string; // bigserial comes back as string from pg
    tick: string; // bigint comes back as string from pg
    planet_id: string;
    agent_id: string;
    net_balance: number;
    monthly_net_income: number;
    total_workers: number;
    production_value: number;
    facility_count: number;
    storage_value: number;
    created_at: Date;
}

export interface InsertAgentMonthlyHistory {
    tick: number;
    planet_id: string;
    agent_id: string;
    net_balance: number;
    monthly_net_income: number;
    total_workers: number;
    production_value?: number;
    facility_count?: number;
    storage_value?: number;
}

/**
 * Insert agent monthly history rows.
 * Records per-agent metrics at month boundaries (every 30 ticks).
 */
export async function insertAgentMonthlyHistory(db: Knex, rows: InsertAgentMonthlyHistory[]): Promise<void> {
    if (rows.length === 0) {
        return;
    }
    await db('agent_monthly_history').insert(
        rows.map((r) => ({
            tick: String(r.tick),
            planet_id: r.planet_id,
            agent_id: r.agent_id,
            net_balance: r.net_balance,
            monthly_net_income: r.monthly_net_income,
            total_workers: r.total_workers,
            production_value: r.production_value ?? 0,
            facility_count: r.facility_count ?? 0,
            storage_value: r.storage_value ?? 0,
        })),
    );
}

/**
 * Get the full monthly history for a specific agent, ordered by tick descending.
 */
export async function getAgentMonthlyHistory(
    db: Knex,
    agentId: string,
    limit: number = 100,
): Promise<AgentMonthlyHistoryRow[]> {
    return db('agent_monthly_history')
        .where({ agent_id: agentId })
        .orderBy('tick', 'desc')
        .limit(limit)
        .select() as Promise<AgentMonthlyHistoryRow[]>;
}

/**
 * Get the most recent monthly history row for every agent on a planet (latest tick).
 */
export async function getLatestAgentMonthlyHistoryByPlanet(
    db: Knex,
    planetId: string,
): Promise<AgentMonthlyHistoryRow[]> {
    // Use a DISTINCT ON query to efficiently fetch the latest row per agent
    return db
        .raw(
            `SELECT DISTINCT ON (agent_id) *
         FROM agent_monthly_history
         WHERE planet_id = ?
         ORDER BY agent_id, tick DESC`,
            [planetId],
        )
        .then((res: { rows: AgentMonthlyHistoryRow[] }) => res.rows);
}

/**
 * Clean up old agent monthly history, keeping only the last 12 months (1 year) of data.
 * This helps manage storage while preserving a full year of history for annual analysis.
 */
export async function pruneAgentMonthlyHistory(db: Knex): Promise<number> {
    const KEEP_MONTHS = 12; // Keep 1 year of data

    // Get the tick of the 12th most recent month
    const rows = await db('agent_monthly_history')
        .distinct('tick')
        .orderBy('tick', 'desc')
        .limit(KEEP_MONTHS)
        .select('tick');

    if (rows.length < KEEP_MONTHS) {
        // Fewer than 12 months of data — nothing to prune.
        return 0;
    }

    const cutoffTick = Number(rows[rows.length - 1].tick);

    const deleted = await db('agent_monthly_history').where('tick', '<', cutoffTick).del();
    return deleted;
}
