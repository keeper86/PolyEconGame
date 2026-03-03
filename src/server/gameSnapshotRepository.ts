/**
 * server/gameSnapshotRepository.ts
 *
 * Repository layer for reading and writing sparse cold game snapshots.
 * These are MessagePack-serialized blobs of the full GameState,
 * stored periodically (e.g. every 360 ticks) for crash recovery.
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
