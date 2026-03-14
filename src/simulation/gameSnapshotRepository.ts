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
