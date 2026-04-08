/**
 * server/gameSnapshotRepository.test.ts
 *
 * Integration tests for the game snapshot repository layer.
 * Uses a testcontainer PostgreSQL instance to verify snapshot CRUD operations.
 */

import { getDb } from 'tests/vitest/setupTestcontainer';
import { describe, expect, it } from 'vitest';
import {
    getGameSnapshotByTick,
    getLatestGameSnapshot,
    getPlanetPopulationHistoryAggregated,
    getProductPriceHistory,
    insertGameSnapshot,
    insertPlanetPopulationHistory,
    insertProductPriceHistory,
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

// ---------------------------------------------------------------------------
// Product price history — write → refresh → read
// ---------------------------------------------------------------------------

describe('product price history: write-refresh-read', () => {
    const PLANET = 'test-planet-pph';
    const PRODUCT = 'TestProduct';

    /**
     * Helper: refresh only product_price_monthly directly.
     * We bypass `refreshContinuousAggregates` because that also refreshes
     * planet_population_monthly / agent_monthly_summary, which may not have
     * underlying data in the test DB and can cause connection termination errors.
     */
    async function refreshProductPriceMonthly(upToTick: number): Promise<void> {
        const db = getDb();
        const refreshStartTick = Math.max(0, upToTick - 60); // 2× monthly bucket
        await db.raw(`CALL refresh_continuous_aggregate(?, ?::bigint, ?::bigint)`, [
            'product_price_monthly',
            refreshStartTick,
            upToTick,
        ]);
    }

    /**
     * Regression test for the race condition fixed in worker.ts:
     *
     * Previously flushProductPrices() fired the DB insert as void, then
     * refreshContinuousAggregates() ran immediately — before the insert committed.
     * The CAGG was refreshed against empty data and returned 0 rows.
     *
     * Additionally, game_tick_now() reads MAX(tick) from game_snapshots. When no
     * snapshot exists, it returns 0, and TimescaleDB clips the CAGG refresh window
     * to [0, 0) regardless of the explicit upper bound — so nothing gets materialized.
     *
     * The worker saves snapshots every SNAPSHOT_INTERVAL_TICKS (default 360) ticks,
     * meaning at tick 30 (January boundary) there IS already a snapshot at tick 1,
     * so game_tick_now() = 1. Still less than 31 — same problem.
     *
     * Fix: game_tick_now() must return a value >= the refresh window end, OR
     * product_price_history must not use an integer_now_func at all (since we
     * always call refresh with explicit bounds and have no background policy).
     */
    it('January bucket is visible after insert + refresh with tick + TICKS_PER_MONTH', async () => {
        const db = getDb();

        const JAN_TICK = 30;

        // game_tick_now() now returns GREATEST(snapshot_max, price_max + 30).
        // After inserting a price row at tick=30, game_tick_now() = 30 + 30 = 60,
        // which satisfies the window requirement of >= JAN_TICK + BUCKET_WIDTH = 60.
        await insertProductPriceHistory(db, [
            { tick: JAN_TICK, planet_id: PLANET, product_name: PRODUCT, avgPrice: 10, minPrice: 9, maxPrice: 11 },
        ]);

        // Bucket 30 covers ticks [30, 60). For TimescaleDB to include a bucket in
        // a refresh, the FULL bucket must fall within [window_start, window_end).
        // So window_end must be >= 60 (bucket_start + bucket_width = 30 + 30).
        await refreshProductPriceMonthly(JAN_TICK + 30);

        const rows = await getProductPriceHistory(db, PLANET, PRODUCT, 'monthly', 13);

        expect(rows.length).toBeGreaterThanOrEqual(1);
        const janBucket = rows.find((r) => Number(r.bucket) === JAN_TICK);
        expect(janBucket).toBeDefined();
        expect(janBucket!.avg_price).toBeCloseTo(10);
        expect(janBucket!.min_price).toBeCloseTo(9);
        expect(janBucket!.max_price).toBeCloseTo(11);
    });

    /**
     * Documents the old partial-window bug: passing upToTick = tick (not tick + bucket_width)
     * means the bucket at tick is "partial" (start of the bucket is at the window boundary)
     * and TimescaleDB skips it. The correct call is tick + TICKS_PER_MONTH.
     */
    it('refresh with window end = tick skips the bucket (partial window bug)', async () => {
        const db = getDb();

        const CLEAN_PLANET = 'test-planet-pph-clean';
        // game_tick_now() reads MAX(product_price_history.tick) + 30, so after
        // inserting at tick=30 game_tick_now() = 60 — but our window ends at 30,
        // so the bucket [30, 60) is still excluded (partial coverage from the left).
        await insertProductPriceHistory(db, [
            { tick: 30, planet_id: CLEAN_PLANET, product_name: PRODUCT, avgPrice: 5, minPrice: 4, maxPrice: 6 },
        ]);

        // Window [0, 30) — bucket 30 is at the boundary but TimescaleDB needs
        // the full bucket [30, 60) to be inside the window, so it's skipped.
        await refreshProductPriceMonthly(30);

        const rows = await getProductPriceHistory(db, CLEAN_PLANET, PRODUCT, 'monthly', 13);
        const bucket = rows.find((r) => Number(r.bucket) === 30);

        // Bucket at 30 is absent — window was too narrow.
        expect(bucket).toBeUndefined();
    });

    it('refresh with window end = tick + TICKS_PER_MONTH makes the February bucket visible', async () => {
        const db = getDb();

        const FEB_TICK = 60;
        const BUCKET_WIDTH = 30; // TICKS_PER_MONTH

        // Ensure game_tick_now() >= FEB_TICK + BUCKET_WIDTH = 90.
        await insertGameSnapshot(db, {
            tick: FEB_TICK + BUCKET_WIDTH,
            game_id: 1,
            snapshot_data: mockSnapshotData(98),
        });

        await insertProductPriceHistory(db, [
            { tick: FEB_TICK, planet_id: PLANET, product_name: PRODUCT, avgPrice: 20, minPrice: 18, maxPrice: 22 },
        ]);

        // Correct: window end = FEB_TICK + BUCKET_WIDTH = 90 so bucket [60,90) is fully inside.
        await refreshProductPriceMonthly(FEB_TICK + BUCKET_WIDTH);

        const rows = await getProductPriceHistory(db, PLANET, PRODUCT, 'monthly', 13);
        const febBucket = rows.find((r) => Number(r.bucket) === FEB_TICK);

        expect(febBucket).toBeDefined();
        expect(febBucket!.avg_price).toBeCloseTo(20);
    });
});

// ---------------------------------------------------------------------------
// Planet population history — write → refresh → read
// ---------------------------------------------------------------------------

describe('planet population history: write-refresh-read', () => {
    async function refreshPopulationMonthly(upToTick: number): Promise<void> {
        const db = getDb();
        const refreshStartTick = Math.max(0, upToTick - 60);
        await db.raw(`CALL refresh_continuous_aggregate(?, ?::bigint, ?::bigint)`, [
            'planet_population_monthly',
            refreshStartTick,
            upToTick,
        ]);
    }

    it('January bucket is visible after insert + refresh with tick + TICKS_PER_MONTH', async () => {
        const db = getDb();

        const JAN_TICK = 30;

        // game_tick_now() returns GREATEST(snapshot_max, price_max + 30, population_max + 30).
        // After inserting a population row at tick=30, game_tick_now() >= 60,
        // which satisfies the window requirement of >= JAN_TICK + BUCKET_WIDTH = 60.
        await insertPlanetPopulationHistory(db, [
            { tick: JAN_TICK, planet_id: 'test-planet-pop-jan', population: 1_000_000 },
        ]);

        await refreshPopulationMonthly(JAN_TICK + 30);

        const rows = await getPlanetPopulationHistoryAggregated(db, 'test-planet-pop-jan', 'monthly', 13);

        expect(rows.length).toBeGreaterThanOrEqual(1);
        const janBucket = rows.find((r) => Number(r.bucket) === JAN_TICK);
        expect(janBucket).toBeDefined();
        expect(janBucket!.avg_population).toBeCloseTo(1_000_000);
    });

    it('refresh with window end = tick skips the bucket (partial window bug)', async () => {
        const db = getDb();

        await insertPlanetPopulationHistory(db, [
            { tick: 30, planet_id: 'test-planet-pop-clean', population: 500_000 },
        ]);

        // Window [0, 30) — bucket 30 is at the boundary, so TimescaleDB skips it.
        await refreshPopulationMonthly(30);

        const rows = await getPlanetPopulationHistoryAggregated(db, 'test-planet-pop-clean', 'monthly', 13);
        const bucket = rows.find((r) => Number(r.bucket) === 30);

        expect(bucket).toBeUndefined();
    });

    it('multiple planets in the same tick are all materialised', async () => {
        const db = getDb();

        const TICK = 90;
        const planets = ['test-pop-p1', 'test-pop-p2', 'test-pop-p3'];

        await insertPlanetPopulationHistory(
            db,
            planets.map((planet_id, i) => ({ tick: TICK, planet_id, population: (i + 1) * 1_000_000 })),
        );

        await refreshPopulationMonthly(TICK + 30);

        for (const [i, planet_id] of planets.entries()) {
            const rows = await getPlanetPopulationHistoryAggregated(db, planet_id, 'monthly', 13);
            const bucket = rows.find((r) => Number(r.bucket) === TICK);
            expect(bucket).toBeDefined();
            expect(bucket!.avg_population).toBeCloseTo((i + 1) * 1_000_000);
        }
    });

    it('consecutive months accumulate correctly', async () => {
        const db = getDb();

        const PLANET2 = 'test-pop-consecutive';
        const insertRows = [
            { tick: 30, planet_id: PLANET2, population: 1_000_000 },
            { tick: 60, planet_id: PLANET2, population: 1_100_000 },
            { tick: 90, planet_id: PLANET2, population: 1_200_000 },
        ];

        await insertPlanetPopulationHistory(db, insertRows);
        await refreshPopulationMonthly(90 + 30);

        const result = await getPlanetPopulationHistoryAggregated(db, PLANET2, 'monthly', 13);

        expect(result.length).toBeGreaterThanOrEqual(3);
        for (const { tick, population } of insertRows) {
            const bucket = result.find((r) => Number(r.bucket) === tick);
            expect(bucket).toBeDefined();
            expect(bucket!.avg_population).toBeCloseTo(population);
        }
    });
});
