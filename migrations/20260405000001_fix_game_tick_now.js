/**
 * Fix game_tick_now() so it doesn't clip refresh windows for product_price_monthly.
 *
 * Previously: game_tick_now() = MAX(tick) FROM game_snapshots
 * Problem:    Snapshots are saved every 360 ticks. At tick=30 (January boundary),
 *             game_tick_now() = 1 (only snapshot at tick=1). TimescaleDB clips the
 *             refresh window to [0, 1), so the January bucket [30, 60) is never
 *             materialized even though price data exists.
 *
 * Fix: also consider MAX(tick) FROM product_price_history. If a price row exists at
 *      tick T, the bucket at T spans [T, T+bucket_width), so "now" is at least T+30.
 *      This means game_tick_now() returns GREATEST(snapshot_max, price_max + 30),
 *      which is >= the upToTick we pass (tick + TICKS_PER_MONTH = tick + 30).
 */
exports.up = async function (knex) {
    await knex.raw(`
        CREATE OR REPLACE FUNCTION game_tick_now()
        RETURNS BIGINT LANGUAGE SQL STABLE AS $$
            SELECT GREATEST(
                COALESCE((SELECT MAX(tick) FROM game_snapshots), 0),
                COALESCE((SELECT MAX(tick) + 30 FROM product_price_history), 0)
            )::BIGINT
        $$
    `);
};

exports.down = async function (knex) {
    // Restore original definition
    await knex.raw(`
        CREATE OR REPLACE FUNCTION game_tick_now()
        RETURNS BIGINT LANGUAGE SQL STABLE AS
        $$ SELECT COALESCE((SELECT MAX(tick) FROM game_snapshots), 0)::BIGINT $$
    `);
};
