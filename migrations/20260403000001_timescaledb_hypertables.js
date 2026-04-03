/**
 * Enable TimescaleDB and convert existing history tables to hypertables.
 *
 * This migration:
 *  1. Enables the TimescaleDB extension.
 *  2. Adds a `wages` column to agent_monthly_history.
 *  3. Converts planet_population_history and agent_monthly_history to
 *     hypertables partitioned by `tick` (integer time dimension,
 *     chunk_time_interval = 360 ticks = 1 game year).
 *  4. Creates the product_price_history table as a hypertable.
 *  5. Creates continuous aggregates at monthly (30), yearly (360) and
 *     decade (3600) granularities for all three tables.
 *  6. Adds continuous-aggregate refresh policies.
 *  7. Adds retention policies on the raw hypertables (drop after 3600 ticks).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    // -------------------------------------------------------------------------
    // 1. Enable TimescaleDB
    // -------------------------------------------------------------------------
    await knex.raw('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE');

    // -------------------------------------------------------------------------
    // 2. Add wages column to agent_monthly_history
    // -------------------------------------------------------------------------
    await knex.schema.alterTable('agent_monthly_history', (table) => {
        table.double('wages').defaultTo(0);
    });

    // -------------------------------------------------------------------------
    // 3. Convert existing tables to hypertables
    //    TimescaleDB requires that every unique index includes the partition
    //    column (tick).  The tables were created with a standalone bigserial
    //    primary key on `id` which violates this rule, so we drop those PKs
    //    first.  The `id` column remains as a plain bigserial column.
    //    agent_monthly_history also has a unique constraint on
    //    (planet_id, agent_id, tick) which already includes tick — fine.
    //    migrate_data => true carries over already-inserted rows.
    //    chunk_time_interval => 360 = 1 game year of ticks per chunk.
    // -------------------------------------------------------------------------
    await knex.raw(`ALTER TABLE planet_population_history DROP CONSTRAINT IF EXISTS planet_population_history_pkey`);
    await knex.raw(`ALTER TABLE agent_monthly_history       DROP CONSTRAINT IF EXISTS agent_monthly_history_pkey`);

    await knex.raw(`
        SELECT create_hypertable(
            'planet_population_history',
            'tick',
            chunk_time_interval => 360,
            migrate_data => true,
            if_not_exists => true
        )
    `);

    await knex.raw(`
        SELECT create_hypertable(
            'agent_monthly_history',
            'tick',
            chunk_time_interval => 360,
            migrate_data => true,
            if_not_exists => true
        )
    `);

    // -------------------------------------------------------------------------
    // 4. Create product_price_history hypertable
    // -------------------------------------------------------------------------
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS product_price_history (
            tick        BIGINT      NOT NULL,
            planet_id   TEXT        NOT NULL,
            product_name TEXT       NOT NULL,
            price       DOUBLE PRECISION NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await knex.raw(`
        SELECT create_hypertable(
            'product_price_history',
            'tick',
            chunk_time_interval => 360,
            if_not_exists => true
        )
    `);

    await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_product_price_planet_product_tick
            ON product_price_history (planet_id, product_name, tick DESC)
    `);

    // -------------------------------------------------------------------------
    // 4b. Register an integer_now_func on all three hypertables.
    //     TimescaleDB continuous aggregates on integer-partitioned hypertables
    //     require a custom function that returns the "current" integer time.
    //     We use a large constant (9 999 999) as a safe upper bound — the game
    //     would need to run for ~27 000 in-game years before it is reached.
    // -------------------------------------------------------------------------
    await knex.raw(`
        CREATE OR REPLACE FUNCTION game_tick_now()
        RETURNS BIGINT LANGUAGE SQL STABLE AS
        $$ SELECT 9999999::BIGINT $$
    `);

    await knex.raw(
        `SELECT set_integer_now_func('planet_population_history', 'game_tick_now', replace_if_exists => true)`,
    );
    await knex.raw(
        `SELECT set_integer_now_func('agent_monthly_history',      'game_tick_now', replace_if_exists => true)`,
    );
    await knex.raw(
        `SELECT set_integer_now_func('product_price_history',      'game_tick_now', replace_if_exists => true)`,
    );

    // -------------------------------------------------------------------------
    // 5a. Continuous aggregates — MONTHLY (bucket = 30 ticks)
    // -------------------------------------------------------------------------

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
        GROUP BY bucket, planet_id, product_name
        WITH NO DATA
    `);

    await knex.raw(`
        CREATE MATERIALIZED VIEW agent_monthly_summary
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(30, tick)          AS bucket,
            planet_id,
            agent_id,
            avg(net_balance)               AS avg_net_balance,
            avg(monthly_net_income)        AS avg_monthly_net_income,
            avg(total_workers)             AS avg_total_workers,
            avg(wages)                     AS avg_wages,
            sum(production_value)          AS sum_production_value,
            avg(facility_count)            AS avg_facility_count,
            avg(storage_value)             AS avg_storage_value
        FROM agent_monthly_history
        GROUP BY bucket, planet_id, agent_id
        WITH NO DATA
    `);

    await knex.raw(`
        CREATE MATERIALIZED VIEW planet_population_monthly
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(30, tick)          AS bucket,
            planet_id,
            avg(population)                AS avg_population,
            avg(starvation_level)          AS avg_starvation,
            avg(food_price)                AS avg_price_level
        FROM planet_population_history
        GROUP BY bucket, planet_id
        WITH NO DATA
    `);

    // -------------------------------------------------------------------------
    // 5b. Continuous aggregates — YEARLY (bucket = 360 ticks)
    //     Built on top of the monthly aggregates for efficiency.
    // -------------------------------------------------------------------------

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
        CREATE MATERIALIZED VIEW agent_yearly_summary
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(360, bucket)       AS bucket,
            planet_id,
            agent_id,
            avg(avg_net_balance)           AS avg_net_balance,
            avg(avg_monthly_net_income)    AS avg_monthly_net_income,
            avg(avg_total_workers)         AS avg_total_workers,
            avg(avg_wages)                 AS avg_wages,
            sum(sum_production_value)      AS sum_production_value
        FROM agent_monthly_summary
        GROUP BY time_bucket(360, bucket), planet_id, agent_id
        WITH NO DATA
    `);

    await knex.raw(`
        CREATE MATERIALIZED VIEW planet_population_yearly
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(360, bucket)       AS bucket,
            planet_id,
            avg(avg_population)            AS avg_population,
            avg(avg_starvation)            AS avg_starvation,
            avg(avg_price_level)           AS avg_price_level
        FROM planet_population_monthly
        GROUP BY time_bucket(360, bucket), planet_id
        WITH NO DATA
    `);

    // -------------------------------------------------------------------------
    // 5c. Continuous aggregates — DECADE (bucket = 3600 ticks)
    //     Built on top of the yearly aggregates.
    // -------------------------------------------------------------------------

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

    await knex.raw(`
        CREATE MATERIALIZED VIEW agent_decade_summary
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(3600, bucket)      AS bucket,
            planet_id,
            agent_id,
            avg(avg_net_balance)           AS avg_net_balance,
            avg(avg_monthly_net_income)    AS avg_monthly_net_income,
            avg(avg_total_workers)         AS avg_total_workers,
            avg(avg_wages)                 AS avg_wages,
            sum(sum_production_value)      AS sum_production_value
        FROM agent_yearly_summary
        GROUP BY time_bucket(3600, bucket), planet_id, agent_id
        WITH NO DATA
    `);

    await knex.raw(`
        CREATE MATERIALIZED VIEW planet_population_decade
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(3600, bucket)      AS bucket,
            planet_id,
            avg(avg_population)            AS avg_population,
            avg(avg_starvation)            AS avg_starvation,
            avg(avg_price_level)           AS avg_price_level
        FROM planet_population_yearly
        GROUP BY time_bucket(3600, bucket), planet_id
        WITH NO DATA
    `);

    // -------------------------------------------------------------------------
    // 6. Refresh policies for continuous aggregates
    //    schedule_interval: how often the policy job runs.
    //    start_offset / end_offset: range of data refreshed each run.
    //    Offsets are expressed in the integer tick domain.
    // -------------------------------------------------------------------------

    // Monthly views — refresh every hour (wall-clock), cover up to 60 ticks back
    await knex.raw(`
        SELECT add_continuous_aggregate_policy('product_price_monthly',
            start_offset => 60,
            end_offset   => 0,
            schedule_interval => INTERVAL '1 hour',
            if_not_exists => true)
    `);
    await knex.raw(`
        SELECT add_continuous_aggregate_policy('agent_monthly_summary',
            start_offset => 60,
            end_offset   => 0,
            schedule_interval => INTERVAL '1 hour',
            if_not_exists => true)
    `);
    await knex.raw(`
        SELECT add_continuous_aggregate_policy('planet_population_monthly',
            start_offset => 60,
            end_offset   => 0,
            schedule_interval => INTERVAL '1 hour',
            if_not_exists => true)
    `);

    // Yearly views — refresh daily
    await knex.raw(`
        SELECT add_continuous_aggregate_policy('product_price_yearly',
            start_offset => 720,
            end_offset   => 0,
            schedule_interval => INTERVAL '1 day',
            if_not_exists => true)
    `);
    await knex.raw(`
        SELECT add_continuous_aggregate_policy('agent_yearly_summary',
            start_offset => 720,
            end_offset   => 0,
            schedule_interval => INTERVAL '1 day',
            if_not_exists => true)
    `);
    await knex.raw(`
        SELECT add_continuous_aggregate_policy('planet_population_yearly',
            start_offset => 720,
            end_offset   => 0,
            schedule_interval => INTERVAL '1 day',
            if_not_exists => true)
    `);

    // Decade views — refresh daily
    await knex.raw(`
        SELECT add_continuous_aggregate_policy('product_price_decade',
            start_offset => 7200,
            end_offset   => 0,
            schedule_interval => INTERVAL '1 day',
            if_not_exists => true)
    `);
    await knex.raw(`
        SELECT add_continuous_aggregate_policy('agent_decade_summary',
            start_offset => 7200,
            end_offset   => 0,
            schedule_interval => INTERVAL '1 day',
            if_not_exists => true)
    `);
    await knex.raw(`
        SELECT add_continuous_aggregate_policy('planet_population_decade',
            start_offset => 7200,
            end_offset   => 0,
            schedule_interval => INTERVAL '1 day',
            if_not_exists => true)
    `);

    // -------------------------------------------------------------------------
    // 7. Retention policies on raw hypertables (drop chunks older than 3600 ticks)
    // -------------------------------------------------------------------------
    await knex.raw(`
        SELECT add_retention_policy('planet_population_history',
            drop_after => 3600,
            if_not_exists => true)
    `);
    await knex.raw(`
        SELECT add_retention_policy('agent_monthly_history',
            drop_after => 3600,
            if_not_exists => true)
    `);
    await knex.raw(`
        SELECT add_retention_policy('product_price_history',
            drop_after => 3600,
            if_not_exists => true)
    `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    // Remove retention policies
    await knex.raw(`SELECT remove_retention_policy('product_price_history',   if_not_exists => true)`);
    await knex.raw(`SELECT remove_retention_policy('agent_monthly_history',    if_not_exists => true)`);
    await knex.raw(`SELECT remove_retention_policy('planet_population_history', if_not_exists => true)`);

    // Drop continuous aggregates (cascades through cagg hierarchy)
    for (const view of [
        'product_price_decade',
        'agent_decade_summary',
        'planet_population_decade',
        'product_price_yearly',
        'agent_yearly_summary',
        'planet_population_yearly',
        'product_price_monthly',
        'agent_monthly_summary',
        'planet_population_monthly',
    ]) {
        await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS ${view} CASCADE`);
    }

    // Drop product_price_history table
    await knex.schema.dropTableIfExists('product_price_history');

    // Drop integer_now helper function
    await knex.raw('DROP FUNCTION IF EXISTS game_tick_now()');

    // Remove wages column
    await knex.schema.alterTable('agent_monthly_history', (table) => {
        table.dropColumn('wages');
    });

    // Revert hypertables back to plain tables (not strictly reversible in TimescaleDB,
    // but dropping and recreating would lose data; we leave them as hypertables in down).

    // Drop extension last (may fail if other objects depend on it)
    await knex.raw('DROP EXTENSION IF EXISTS timescaledb CASCADE');
};
