/**
 * Create the agent_monthly_history table.
 *
 * Records per-agent metrics at each month boundary (every 30 ticks).
 * Used for tracking agent performance over time with rolling averages.
 *
 * Schema:
 *   tick       – simulation tick (month boundary, multiple of 30)
 *   planet_id  – string identifier of the planet
 *   agent_id   – string identifier of the agent
 *   net_balance – agent wealth (deposits - loans) at month end
 *   monthly_net_income – revenue - expenses for the month
 *   total_workers – total workers employed by agent at month end
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.createTable('agent_monthly_history', function (table) {
        table.bigIncrements('id').primary();
        table.bigInteger('tick').notNullable();
        table.string('planet_id').notNullable();
        table.string('agent_id').notNullable();

        // Core metrics as requested
        table.double('net_balance').notNullable().defaultTo(0);
        table.double('monthly_net_income').notNullable().defaultTo(0);
        table.integer('total_workers').notNullable().defaultTo(0);

        // Additional useful metrics for future analysis
        table.double('production_value').defaultTo(0);
        table.integer('facility_count').defaultTo(0);
        table.double('storage_value').defaultTo(0);

        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        // Ensure one row per agent per planet per month
        table.unique(['planet_id', 'agent_id', 'tick']);
    });

    // Index for fast time-series lookup per agent
    await knex.raw(
        'CREATE INDEX idx_agent_monthly_agent_planet_tick ON agent_monthly_history (agent_id, planet_id, tick DESC)',
    );

    // Index for queries by planet
    await knex.raw('CREATE INDEX idx_agent_monthly_planet_tick ON agent_monthly_history (planet_id, tick DESC)');

    // Index for global time-series queries
    await knex.raw('CREATE INDEX idx_agent_monthly_tick ON agent_monthly_history (tick DESC)');
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('agent_monthly_history');
};
