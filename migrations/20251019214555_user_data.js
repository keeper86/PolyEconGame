/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('user_data', function (table) {
        table.string('user_id').primary().notNullable().index();
        table.string('email').notNullable();
        table.boolean('has_assessment_published').notNullable().index().defaultTo(false);
        table.string('display_name').nullable();
        table.string('agent_id').nullable().unique().defaultTo(null);
        table.binary('avatar').nullable().defaultTo(null);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('user_data');
};
