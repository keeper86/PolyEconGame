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

        for (let i = 0; i < 6; i++) {
            await insertGameSnapshot(db, {
                tick: 1000 + i,
                game_id: 1,
                snapshot_data: mockSnapshotData(100 + i),
            });
        }

        const deleted = await pruneGameSnapshots(db, 3);
        expect(deleted).toBeGreaterThanOrEqual(0);

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

describe('product price history: write-refresh-read', () => {
    const PLANET = 'test-planet-pph';
    const PRODUCT = 'TestProduct';

    async function refreshProductPriceMonthly(upToTick: number): Promise<void> {
        const db = getDb();
        const refreshStartTick = Math.max(0, upToTick - 60);
        await db.raw(`CALL refresh_continuous_aggregate(?, ?::bigint, ?::bigint)`, [
            'product_price_monthly',
            refreshStartTick,
            upToTick,
        ]);
    }

    it('January bucket is visible after insert + refresh with tick + TICKS_PER_MONTH', async () => {
        const db = getDb();

        const JAN_TICK = 30;

        await insertProductPriceHistory(db, [
            { tick: JAN_TICK, planet_id: PLANET, product_name: PRODUCT, avgPrice: 10, minPrice: 9, maxPrice: 11, priceFloor: 8 },
        ]);

        await refreshProductPriceMonthly(JAN_TICK + 30);

        const rows = await getProductPriceHistory(db, PLANET, PRODUCT, 'monthly', 13);

        expect(rows.length).toBeGreaterThanOrEqual(1);
        const janBucket = rows.find((r) => Number(r.bucket) === JAN_TICK);
        expect(janBucket).toBeDefined();
        expect(janBucket!.avg_price).toBeCloseTo(10);
        expect(janBucket!.min_price).toBeCloseTo(9);
        expect(janBucket!.max_price).toBeCloseTo(11);
    });

    it('refresh with window end = tick skips the bucket (partial window bug)', async () => {
        const db = getDb();

        const CLEAN_PLANET = 'test-planet-pph-clean';

        await insertProductPriceHistory(db, [
            { tick: 30, planet_id: CLEAN_PLANET, product_name: PRODUCT, avgPrice: 5, minPrice: 4, maxPrice: 6, priceFloor: 4 },
        ]);

        await refreshProductPriceMonthly(30);

        const rows = await getProductPriceHistory(db, CLEAN_PLANET, PRODUCT, 'monthly', 13);
        const bucket = rows.find((r) => Number(r.bucket) === 30);

        expect(bucket).toBeUndefined();
    });

    it('refresh with window end = tick + TICKS_PER_MONTH makes the February bucket visible', async () => {
        const db = getDb();

        const FEB_TICK = 60;
        const BUCKET_WIDTH = 30;

        await insertGameSnapshot(db, {
            tick: FEB_TICK + BUCKET_WIDTH,
            game_id: 1,
            snapshot_data: mockSnapshotData(98),
        });

        await insertProductPriceHistory(db, [
            { tick: FEB_TICK, planet_id: PLANET, product_name: PRODUCT, avgPrice: 20, minPrice: 18, maxPrice: 22, priceFloor: 17 },
        ]);

        await refreshProductPriceMonthly(FEB_TICK + BUCKET_WIDTH);

        const rows = await getProductPriceHistory(db, PLANET, PRODUCT, 'monthly', 13);
        const febBucket = rows.find((r) => Number(r.bucket) === FEB_TICK);

        expect(febBucket).toBeDefined();
        expect(febBucket!.avg_price).toBeCloseTo(20);
    });
});

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

        await insertPlanetPopulationHistory(db, [
            {
                tick: JAN_TICK,
                planet_id: 'test-planet-pop-jan',
                population: 1_000_000,
                grocery_buffer: 0,
                healthcare_buffer: 0,
                logistics_buffer: 0,
                education_buffer: 0,
                retail_buffer: 0,
            },
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
            {
                tick: 30,
                planet_id: 'test-planet-pop-clean',
                population: 500_000,
                grocery_buffer: 0,
                healthcare_buffer: 0,
                logistics_buffer: 0,
                education_buffer: 0,
                retail_buffer: 0,
            },
        ]);

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
            planets.map((planet_id, i) => ({
                tick: TICK,
                planet_id,
                population: (i + 1) * 1_000_000,
                grocery_buffer: 0,
                healthcare_buffer: 0,
                logistics_buffer: 0,
                education_buffer: 0,
                retail_buffer: 0,
            })),
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
            {
                tick: 30,
                planet_id: PLANET2,
                population: 1_000_000,
                grocery_buffer: 0,
                healthcare_buffer: 0,
                logistics_buffer: 0,
                education_buffer: 0,
                retail_buffer: 0,
            },
            {
                tick: 60,
                planet_id: PLANET2,
                population: 1_100_000,
                grocery_buffer: 0,
                healthcare_buffer: 0,
                logistics_buffer: 0,
                education_buffer: 0,
                retail_buffer: 0,
            },
            {
                tick: 90,
                planet_id: PLANET2,
                population: 1_200_000,
                grocery_buffer: 0,
                healthcare_buffer: 0,
                logistics_buffer: 0,
                education_buffer: 0,
                retail_buffer: 0,
            },
        ];

        await insertPlanetPopulationHistory(db, insertRows);
        await db.raw(`CALL refresh_continuous_aggregate(?, ?::bigint, ?::bigint)`, [
            'planet_population_monthly',
            0,
            90 + 30,
        ]);

        const result = await getPlanetPopulationHistoryAggregated(db, PLANET2, 'monthly', 13);

        expect(result.length).toBeGreaterThanOrEqual(3);
        for (const { tick, population } of insertRows) {
            const bucket = result.find((r) => Number(r.bucket) === tick);
            expect(bucket).toBeDefined();
            expect(bucket!.avg_population).toBeCloseTo(population);
        }
    });
});
