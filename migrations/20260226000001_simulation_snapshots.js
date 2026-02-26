/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        .createTable('planet_snapshots', function (table) {
            table.integer('tick').notNullable();
            table.string('planet_id').notNullable();
            table.bigInteger('population_total').notNullable().defaultTo(0);
            table.jsonb('snapshot').notNullable();
            table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
            table.primary(['tick', 'planet_id']);
            table.index('planet_id');
        })
        .createTable('agent_snapshots', function (table) {
            table.integer('tick').notNullable();
            table.string('agent_id').notNullable();
            table.bigInteger('wealth').notNullable().defaultTo(0);
            table.jsonb('storage').notNullable().defaultTo('{}');
            table.jsonb('production').notNullable().defaultTo('{}');
            table.jsonb('consumption').notNullable().defaultTo('{}');
            table.jsonb('agent_summary').notNullable();
            table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
            table.primary(['tick', 'agent_id']);
            table.index('agent_id');
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('agent_snapshots').dropTableIfExists('planet_snapshots');
};
