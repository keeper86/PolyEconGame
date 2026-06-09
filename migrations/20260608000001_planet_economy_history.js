exports.up = async function (knex) {
    await knex.raw(`
        CREATE TABLE planet_economy_history (
            tick                BIGINT           NOT NULL,
            planet_id           TEXT             NOT NULL,
            gdp                 DOUBLE PRECISION NOT NULL DEFAULT 0,
            cost_of_living      DOUBLE PRECISION NOT NULL DEFAULT 0,
            cost_of_living_rich DOUBLE PRECISION NOT NULL DEFAULT 0,
            wage_edu0           DOUBLE PRECISION NOT NULL DEFAULT 0,
            wage_edu1           DOUBLE PRECISION NOT NULL DEFAULT 0,
            wage_edu2           DOUBLE PRECISION NOT NULL DEFAULT 0,
            wage_edu3           DOUBLE PRECISION NOT NULL DEFAULT 0,
            policy_rate         DOUBLE PRECISION NOT NULL DEFAULT 0,
            bank_equity         DOUBLE PRECISION NOT NULL DEFAULT 0,
            money_supply        DOUBLE PRECISION NOT NULL DEFAULT 0,
            created_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
            UNIQUE (planet_id, tick)
        )
    `);

    await knex.raw(`
        SELECT create_hypertable(
            'planet_economy_history', 'tick',
            chunk_time_interval => 360,
            if_not_exists => true
        )
    `);

    await knex.raw(`CREATE INDEX idx_planet_economy_planet_tick ON planet_economy_history (planet_id, tick DESC)`);

    await knex.raw(`SELECT set_integer_now_func('planet_economy_history', 'game_tick_now', replace_if_exists => true)`);

    await knex.raw(`
        CREATE MATERIALIZED VIEW planet_economy_monthly
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(30, tick)          AS bucket,
            planet_id,
            avg(gdp)::float8               AS avg_gdp,
            avg(cost_of_living)::float8    AS avg_cost_of_living,
            avg(cost_of_living_rich)::float8 AS avg_cost_of_living_rich,
            avg(wage_edu0)::float8         AS avg_wage_edu0,
            avg(wage_edu1)::float8         AS avg_wage_edu1,
            avg(wage_edu2)::float8         AS avg_wage_edu2,
            avg(wage_edu3)::float8         AS avg_wage_edu3,
            avg(policy_rate)::float8       AS avg_policy_rate,
            avg(bank_equity)::float8       AS avg_bank_equity,
            avg(money_supply)::float8      AS avg_money_supply
        FROM planet_economy_history
        GROUP BY time_bucket(30, tick), planet_id
        WITH NO DATA
    `);

    await knex.raw(`
        CREATE MATERIALIZED VIEW planet_economy_yearly
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(360, bucket)       AS bucket,
            planet_id,
            avg(avg_gdp)::float8           AS avg_gdp,
            avg(avg_cost_of_living)::float8 AS avg_cost_of_living,
            avg(avg_cost_of_living_rich)::float8 AS avg_cost_of_living_rich,
            avg(avg_wage_edu0)::float8     AS avg_wage_edu0,
            avg(avg_wage_edu1)::float8     AS avg_wage_edu1,
            avg(avg_wage_edu2)::float8     AS avg_wage_edu2,
            avg(avg_wage_edu3)::float8     AS avg_wage_edu3,
            avg(avg_policy_rate)::float8   AS avg_policy_rate,
            avg(avg_bank_equity)::float8   AS avg_bank_equity,
            avg(avg_money_supply)::float8  AS avg_money_supply
        FROM planet_economy_monthly
        GROUP BY time_bucket(360, bucket), planet_id
        WITH NO DATA
    `);

    await knex.raw(`
        CREATE MATERIALIZED VIEW planet_economy_decade
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(3600, bucket)      AS bucket,
            planet_id,
            avg(avg_gdp)::float8           AS avg_gdp,
            avg(avg_cost_of_living)::float8 AS avg_cost_of_living,
            avg(avg_cost_of_living_rich)::float8 AS avg_cost_of_living_rich,
            avg(avg_wage_edu0)::float8     AS avg_wage_edu0,
            avg(avg_wage_edu1)::float8     AS avg_wage_edu1,
            avg(avg_wage_edu2)::float8     AS avg_wage_edu2,
            avg(avg_wage_edu3)::float8     AS avg_wage_edu3,
            avg(avg_policy_rate)::float8   AS avg_policy_rate,
            avg(avg_bank_equity)::float8   AS avg_bank_equity,
            avg(avg_money_supply)::float8  AS avg_money_supply
        FROM planet_economy_yearly
        GROUP BY time_bucket(3600, bucket), planet_id
        WITH NO DATA
    `);

    await knex.raw(`
        SELECT add_retention_policy('planet_economy_history',
            drop_after => 390, if_not_exists => true)
    `);
};

exports.config = { transaction: false };

exports.down = async function (knex) {
    await knex.raw(`SELECT remove_retention_policy('planet_economy_history', if_not_exists => true)`);

    for (const view of ['planet_economy_decade', 'planet_economy_yearly', 'planet_economy_monthly']) {
        await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS ${view} CASCADE`);
    }

    await knex.schema.dropTableIfExists('planet_economy_history');
};
