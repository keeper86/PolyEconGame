/**
 * Create the game_snapshots table for sparse cold snapshots.
 *
 * Stores MessagePack-serialized blobs of the full GameState
 * at periodic intervals (e.g. every 360 ticks = one in-game year).
 * Used for crash recovery: on startup the worker loads the latest
 * snapshot and resumes simulation from that tick.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.createTable('game_snapshots', function (table) {
        table.bigIncrements('id').primary();
        table.bigInteger('tick').notNullable();
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.integer('game_id').notNullable();
        table.binary('snapshot_data').notNullable();
    });

    // Fast retrieval of the most recent snapshot by tick (descending).
    await knex.raw('CREATE INDEX idx_game_snapshot_tick ON game_snapshots (tick DESC)');

    // Fast retrieval of the most recent snapshot by creation time (descending).
    await knex.raw('CREATE INDEX idx_game_snapshot_created_at ON game_snapshots (created_at DESC)');
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('game_snapshots');
};
