exports.up = async function (knex) {
    // -------------------------------------------------------------------------
    // 1. Enable TimescaleDB
    // -------------------------------------------------------------------------
    await knex.raw('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE');

    // -------------------------------------------------------------------------
    // 2. Create planet_population_history hypertable
    // -------------------------------------------------------------------------
    await knex.raw(`
        CREATE TABLE planet_population_history (
            tick             BIGINT           NOT NULL,
            planet_id        TEXT             NOT NULL,
            population       BIGINT           NOT NULL,
            created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
            UNIQUE (planet_id, tick)
        )
    `);

    await knex.raw(`
        SELECT create_hypertable(
            'planet_population_history', 'tick',
            chunk_time_interval => 360,
            if_not_exists => true
        )
    `);

    await knex.raw(
        `CREATE INDEX idx_planet_pop_history_planet_tick ON planet_population_history (planet_id, tick DESC)`,
    );

    // -------------------------------------------------------------------------
    // 3. Create agent_monthly_history hypertable
    // -------------------------------------------------------------------------
    await knex.raw(`
        CREATE TABLE agent_monthly_history (
            tick                BIGINT           NOT NULL,
            planet_id           TEXT             NOT NULL,
            agent_id            TEXT             NOT NULL,
            net_balance         DOUBLE PRECISION NOT NULL DEFAULT 0,
            monthly_net_income  DOUBLE PRECISION NOT NULL DEFAULT 0,
            total_workers       INTEGER          NOT NULL DEFAULT 0,
            wages               DOUBLE PRECISION          DEFAULT 0,
            production_value    DOUBLE PRECISION          DEFAULT 0,
            consumption_value   DOUBLE PRECISION          DEFAULT 0,
            purchases           DOUBLE PRECISION          DEFAULT 0,
            claim_payments      DOUBLE PRECISION          DEFAULT 0,
            facility_count      INTEGER                   DEFAULT 0,
            storage_value       DOUBLE PRECISION          DEFAULT 0,
            created_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
            UNIQUE (planet_id, agent_id, tick)
        )
    `);

    await knex.raw(`
        SELECT create_hypertable(
            'agent_monthly_history', 'tick',
            chunk_time_interval => 360,
            if_not_exists => true
        )
    `);

    await knex.raw(
        `CREATE INDEX idx_agent_monthly_agent_planet_tick ON agent_monthly_history (agent_id, planet_id, tick DESC)`,
    );
    await knex.raw(`CREATE INDEX idx_agent_monthly_planet_tick ON agent_monthly_history (planet_id, tick DESC)`);

    // -------------------------------------------------------------------------
    // 4. Create product_price_history hypertable
    // -------------------------------------------------------------------------
    await knex.raw(`
        CREATE TABLE product_price_history (
            tick         BIGINT           NOT NULL,
            planet_id    TEXT             NOT NULL,
            product_name TEXT             NOT NULL,
            avg_price    DOUBLE PRECISION NOT NULL,
            min_price    DOUBLE PRECISION NOT NULL DEFAULT 0,
            max_price    DOUBLE PRECISION NOT NULL DEFAULT 0,
            created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
        )
    `);

    await knex.raw(`
        SELECT create_hypertable(
            'product_price_history', 'tick',
            chunk_time_interval => 360,
            if_not_exists => true
        )
    `);

    await knex.raw(
        `CREATE INDEX idx_product_price_planet_product_tick ON product_price_history (planet_id, product_name, tick DESC)`,
    );

    // -------------------------------------------------------------------------
    // 5. Register integer_now_func on all three hypertables
    // -------------------------------------------------------------------------
    await knex.raw(`
        CREATE OR REPLACE FUNCTION game_tick_now()
        RETURNS BIGINT LANGUAGE SQL STABLE AS $$
            SELECT GREATEST(
                COALESCE((SELECT MAX(tick) + 30 FROM product_price_history), 0),
                COALESCE((SELECT MAX(tick) + 30 FROM planet_population_history), 0),
                COALESCE((SELECT MAX(tick) + 30 FROM agent_monthly_history), 0)
            )::BIGINT
        $$
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
    // 7a. Continuous aggregates — MONTHLY (bucket = 30 ticks)
    // -------------------------------------------------------------------------
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

    await knex.raw(`
        CREATE MATERIALIZED VIEW agent_monthly_summary
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(30, tick)          AS bucket,
            planet_id,
            agent_id,
            avg(net_balance)::float8               AS avg_net_balance,
            avg(monthly_net_income)::float8        AS avg_monthly_net_income,
            avg(total_workers)::float8             AS avg_total_workers,
            avg(wages)::float8                     AS avg_wages,
            sum(production_value)::float8          AS sum_production_value,
            sum(consumption_value)::float8         AS sum_consumption_value,
            avg(facility_count)::float8            AS avg_facility_count,
            avg(storage_value)::float8             AS avg_storage_value
        FROM agent_monthly_history
        GROUP BY time_bucket(30, tick), planet_id, agent_id
        WITH NO DATA
    `);

    await knex.raw(`
        CREATE MATERIALIZED VIEW planet_population_monthly
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(30, tick)          AS bucket,
            planet_id,
            avg(population)::float8        AS avg_population
        FROM planet_population_history
        GROUP BY time_bucket(30, tick), planet_id
        WITH NO DATA
    `);

    // -------------------------------------------------------------------------
    // 7b. Continuous aggregates — YEARLY (bucket = 360 ticks)
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
            sum(sum_production_value)      AS sum_production_value,
            sum(sum_consumption_value)     AS sum_consumption_value
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
            avg(avg_population)            AS avg_population
        FROM planet_population_monthly
        GROUP BY time_bucket(360, bucket), planet_id
        WITH NO DATA
    `);

    // -------------------------------------------------------------------------
    // 7c. Continuous aggregates — DECADE (bucket = 3600 ticks)
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
            sum(sum_production_value)      AS sum_production_value,
            sum(sum_consumption_value)     AS sum_consumption_value
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
            avg(avg_population)            AS avg_population
        FROM planet_population_yearly
        GROUP BY time_bucket(3600, bucket), planet_id
        WITH NO DATA
    `);

    // -------------------------------------------------------------------------
    // 8. Retention policies on raw hypertables
    //
    //    Raw rows are retained for 13 months (13 × 30 = 390 ticks). The
    //    cascaded aggregates (monthly → yearly → decade) preserve rolled-up
    //    history indefinitely beyond that window.
    //
    //    NOTE: cascaded CAGGs (yearly on top of monthly, etc.) require the
    //    intermediate view to be explicitly materialized via refresh policies.
    //    Real-time aggregation only covers data directly in the raw hypertable
    //    and does NOT propagate transitively through a CAGG chain.
    // -------------------------------------------------------------------------
    await knex.raw(`
        SELECT add_retention_policy('planet_population_history',
            drop_after => 390, if_not_exists => true)
    `);
    await knex.raw(`
        SELECT add_retention_policy('agent_monthly_history',
            drop_after => 390, if_not_exists => true)
    `);
    await knex.raw(`
        SELECT add_retention_policy('product_price_history',
            drop_after => 390, if_not_exists => true)
    `);

    // -------------------------------------------------------------------------
    // 9. Refresh policies for continuous aggregates
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // 9. No initial refresh needed — views are empty at migration time.
    //    The simulation worker calls refreshContinuousAggregates() at each
    //    month/year/decade tick boundary, so data materializes automatically
    //    as the simulation runs.
    // -------------------------------------------------------------------------
};

// Disable the Knex transaction wrapper for this migration.
// Several TimescaleDB operations (create_hypertable, set_integer_now_func,
// refresh_continuous_aggregate) cannot run inside a transaction block.
exports.config = { transaction: false };

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    // Remove retention policies
    await knex.raw(`SELECT remove_retention_policy('product_price_history',     if_not_exists => true)`);
    await knex.raw(`SELECT remove_retention_policy('agent_monthly_history',      if_not_exists => true)`);
    await knex.raw(`SELECT remove_retention_policy('planet_population_history',  if_not_exists => true)`);

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

    // Drop integer_now helper function
    await knex.raw('DROP FUNCTION IF EXISTS game_tick_now()');

    // Drop tables
    await knex.schema.dropTableIfExists('product_price_history');
    await knex.schema.dropTableIfExists('agent_monthly_history');
    await knex.schema.dropTableIfExists('planet_population_history');

    // Drop extension last
    await knex.raw('DROP EXTENSION IF EXISTS timescaledb CASCADE');
};
