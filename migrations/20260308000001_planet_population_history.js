/**
 * Create the planet_population_history table.
 *
 * Records the total population per planet at each cold-snapshot tick
 * (e.g. every 360 ticks = one in-game year).  Rows are written in the
 * same async task that persists the cold snapshot blob, so tick values
 * in this table always correspond to an entry in game_snapshots.
 *
 * Schema:
 *   tick       – simulation tick (same unit as game_snapshots.tick)
 *   planet_id  – string identifier of the planet (e.g. "earth")
 *   population – total head-count on that planet at that tick
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.createTable('planet_population_history', function (table) {
        table.bigIncrements('id').primary();
        table.bigInteger('tick').notNullable();
        table.string('planet_id').notNullable();
        table.bigInteger('population').notNullable();
        table.float('starvation_level').notNullable().defaultTo(0);
        table.float('food_price').notNullable().defaultTo(0);
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });

    // Fast time-series lookup: all populations for a given planet ordered by tick.
    await knex.raw(
        'CREATE INDEX idx_planet_pop_history_planet_tick ON planet_population_history (planet_id, tick DESC)',
    );

    // Fast retrieval of the most recent row for every planet (tick DESC).
    await knex.raw('CREATE INDEX idx_planet_pop_history_tick ON planet_population_history (tick DESC)');
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('planet_population_history');
};
