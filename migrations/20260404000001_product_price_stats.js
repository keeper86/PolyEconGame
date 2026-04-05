/**
 * Replace the single `price` column in product_price_history with
 * `avg_price`, `min_price`, and `max_price` so that each monthly flush
 * can record the true intra-month min/max/avg instead of a single spot price.
 *
 * Steps:
 *   1. Drop dependent continuous aggregate views (decade → yearly → monthly)
 *   2. Rename `price` → `avg_price`; add `min_price` and `max_price`
 *   3. Back-fill existing rows (min = max = avg for legacy single-sample rows)
 *   4. Recreate the three continuous aggregate views
 *   5. Recreate the refresh policies
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    // 1. Drop CAGGs that depend on product_price_history (cascade handles ordering)
    await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS product_price_decade  CASCADE`);
    await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS product_price_yearly  CASCADE`);
    await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS product_price_monthly CASCADE`);

    // 2. Rename price → avg_price and add min/max columns
    await knex.raw(`ALTER TABLE product_price_history RENAME COLUMN price TO avg_price`);
    await knex.raw(`ALTER TABLE product_price_history ADD COLUMN min_price DOUBLE PRECISION NOT NULL DEFAULT 0`);
    await knex.raw(`ALTER TABLE product_price_history ADD COLUMN max_price DOUBLE PRECISION NOT NULL DEFAULT 0`);

    // 3. Back-fill legacy rows (single spot sample → min = max = avg)
    await knex.raw(`UPDATE product_price_history SET min_price = avg_price, max_price = avg_price`);

    // 4a. Monthly CAGG
    await knex.raw(`
        CREATE MATERIALIZED VIEW product_price_monthly
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(30, tick)  AS bucket,
            planet_id,
            product_name,
            avg(avg_price)         AS avg_price,
            min(min_price)         AS min_price,
            max(max_price)         AS max_price
        FROM product_price_history
        GROUP BY time_bucket(30, tick), planet_id, product_name
        WITH NO DATA
    `);

    // 4b. Yearly CAGG (cascaded from monthly)
    await knex.raw(`
        CREATE MATERIALIZED VIEW product_price_yearly
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(360, bucket) AS bucket,
            planet_id,
            product_name,
            avg(avg_price)           AS avg_price,
            min(min_price)           AS min_price,
            max(max_price)           AS max_price
        FROM product_price_monthly
        GROUP BY time_bucket(360, bucket), planet_id, product_name
        WITH NO DATA
    `);

    // 4c. Decade CAGG (cascaded from yearly)
    await knex.raw(`
        CREATE MATERIALIZED VIEW product_price_decade
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(3600, bucket) AS bucket,
            planet_id,
            product_name,
            avg(avg_price)            AS avg_price,
            min(min_price)            AS min_price,
            max(max_price)            AS max_price
        FROM product_price_yearly
        GROUP BY time_bucket(3600, bucket), planet_id, product_name
        WITH NO DATA
    `);

    // 5. Do not recreate TimescaleDB refresh policies here.
    // These product_price_* continuous aggregates are refreshed manually by the worker,
    // so adding background policies would duplicate refresh work and increase load.
};

exports.config = { transaction: false };

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS product_price_decade  CASCADE`);
    await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS product_price_yearly  CASCADE`);
    await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS product_price_monthly CASCADE`);

    await knex.raw(`ALTER TABLE product_price_history DROP COLUMN IF EXISTS min_price`);
    await knex.raw(`ALTER TABLE product_price_history DROP COLUMN IF EXISTS max_price`);
    await knex.raw(`ALTER TABLE product_price_history RENAME COLUMN avg_price TO price`);

    // Recreate original single-price CAGGs
    await knex.raw(`
        CREATE MATERIALIZED VIEW product_price_monthly
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(30, tick)  AS bucket,
            planet_id,
            product_name,
            avg(price)             AS avg_price,
            min(price)             AS min_price,
            max(price)             AS max_price
        FROM product_price_history
        GROUP BY time_bucket(30, tick), planet_id, product_name
        WITH NO DATA
    `);
    await knex.raw(`
        CREATE MATERIALIZED VIEW product_price_yearly
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(360, bucket)       AS bucket,
            planet_id,
            product_name,
            avg(avg_price)                 AS avg_price,
            min(min_price)                 AS min_price,
            max(max_price)                 AS max_price
        FROM product_price_monthly
        GROUP BY time_bucket(360, bucket), planet_id, product_name
        WITH NO DATA
    `);
    await knex.raw(`
        CREATE MATERIALIZED VIEW product_price_decade
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(3600, bucket)      AS bucket,
            planet_id,
            product_name,
            avg(avg_price)                 AS avg_price,
            min(min_price)                 AS min_price,
            max(max_price)                 AS max_price
        FROM product_price_yearly
        GROUP BY time_bucket(3600, bucket), planet_id, product_name
        WITH NO DATA
    `);
};
