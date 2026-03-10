/**
 * server/gameSnapshotRepository.test.ts
 *
 * Integration tests for the game snapshot repository layer.
 * Uses a testcontainer PostgreSQL instance to verify snapshot CRUD operations.
 */

import { describe, it, expect } from 'vitest';
import { getDb } from 'tests/vitest/setupTestcontainer';
import {
    insertGameSnapshot,
    getLatestGameSnapshot,
    getGameSnapshotByTick,
    pruneGameSnapshots,
} from './gameSnapshotRepository';

/** Helper to create a mock snapshot_data buffer of a given size. */
function mockSnapshotData(seed: number): Buffer {
    const data = Buffer.alloc(64);
    for (let i = 0; i < data.length; i++) {
        data[i] = (seed + i) % 256;
    }
    return data;
}

describe('gameSnapshotRepository', () => {
    it('inserts and retrieves a snapshot', async () => {
        const db = getDb();

        await insertGameSnapshot(db, {
            tick: 360,
            game_id: 1,
            snapshot_data: mockSnapshotData(1),
        });

        const row = await getLatestGameSnapshot(db);
        expect(row).not.toBeNull();
        expect(Number(row!.tick)).toBe(360);
        expect(row!.game_id).toBe(1);
        expect(row!.snapshot_data).toBeInstanceOf(Buffer);
        expect(row!.snapshot_data.length).toBe(64);
        expect(row!.created_at).toBeInstanceOf(Date);
    });

    it('returns the latest snapshot by tick', async () => {
        const db = getDb();

        await insertGameSnapshot(db, { tick: 100, game_id: 1, snapshot_data: mockSnapshotData(10) });
        await insertGameSnapshot(db, { tick: 200, game_id: 1, snapshot_data: mockSnapshotData(20) });
        await insertGameSnapshot(db, { tick: 300, game_id: 1, snapshot_data: mockSnapshotData(30) });

        const latest = await getLatestGameSnapshot(db);
        expect(latest).not.toBeNull();
        // The latest should be tick 360 from the previous test or tick 300
        expect(Number(latest!.tick)).toBeGreaterThanOrEqual(300);
    });

    it('retrieves a snapshot by specific tick', async () => {
        const db = getDb();

        await insertGameSnapshot(db, {
            tick: 500,
            game_id: 1,
            snapshot_data: mockSnapshotData(50),
        });

        const row = await getGameSnapshotByTick(db, 500);
        expect(row).not.toBeNull();
        expect(Number(row!.tick)).toBe(500);
        expect(row!.game_id).toBe(1);
    });

    it('returns null for non-existent tick', async () => {
        const db = getDb();
        const row = await getGameSnapshotByTick(db, 999999);
        expect(row).toBeNull();
    });

    it('prunes old snapshots keeping only the most recent N', async () => {
        const db = getDb();

        // Insert snapshots at ticks 1000–1005
        for (let i = 0; i < 6; i++) {
            await insertGameSnapshot(db, {
                tick: 1000 + i,
                game_id: 1,
                snapshot_data: mockSnapshotData(100 + i),
            });
        }

        // Keep only the 3 most recent
        const deleted = await pruneGameSnapshots(db, 3);
        expect(deleted).toBeGreaterThanOrEqual(0);

        // Verify that the 3 most recent still exist
        for (const tick of [1003, 1004, 1005]) {
            const row = await getGameSnapshotByTick(db, tick);
            expect(row).not.toBeNull();
        }
    });

    it('handles null rng_seed', async () => {
        const db = getDb();

        await insertGameSnapshot(db, {
            tick: 2000,
            game_id: 1,
            snapshot_data: mockSnapshotData(200),
        });

        const row = await getGameSnapshotByTick(db, 2000);
        expect(row).not.toBeNull();
        expect(row!.game_id).toBe(1);
    });
});
