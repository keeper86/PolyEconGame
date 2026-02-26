/**
 * Resolve the monolithic `snapshot` JSONB column in `planet_snapshots` into
 * dedicated columns so commonly-queried fields can be accessed without
 * parsing the full JSON blob.
 *
 * New columns:
 *   planet_name           – display name
 *   position              – {x, y, z} coordinates (jsonb, small & fixed)
 *   starvation_level      – float 0–1
 *   pollution_air          – float 0–100
 *   pollution_water        – float 0–100
 *   pollution_soil         – float 0–100
 *   government_id          – agent ref id (nullable)
 *   government_name        – agent ref name (nullable)
 *   infrastructure         – still a jsonb blob (nested but relatively small)
 *   environment            – full environment jsonb (includes regeneration rates & disasters)
 *   demography             – the cohort array (largest part, stays as jsonb)
 *   resources              – resource claim map (stays as jsonb)
 *
 * The old `snapshot` column is dropped.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('planet_snapshots', function (table) {
        table.string('planet_name').notNullable().defaultTo('');
        table.jsonb('position').notNullable().defaultTo('{}');
        table.float('starvation_level').notNullable().defaultTo(0);
        table.float('pollution_air').notNullable().defaultTo(0);
        table.float('pollution_water').notNullable().defaultTo(0);
        table.float('pollution_soil').notNullable().defaultTo(0);
        table.string('government_id').nullable();
        table.string('government_name').nullable();
        table.jsonb('infrastructure').notNullable().defaultTo('{}');
        table.jsonb('environment').notNullable().defaultTo('{}');
        table.jsonb('demography').notNullable().defaultTo('[]');
        table.jsonb('resources').notNullable().defaultTo('{}');
    });

    // Migrate existing data from the snapshot column into the new columns
    await knex.raw(`
        UPDATE planet_snapshots
        SET
            planet_name        = COALESCE(snapshot->>'name', ''),
            position           = COALESCE(snapshot->'position', '{}'),
            starvation_level   = COALESCE((snapshot->'population'->>'starvationLevel')::float, 0),
            pollution_air      = COALESCE((snapshot->'environment'->'pollution'->>'air')::float, 0),
            pollution_water    = COALESCE((snapshot->'environment'->'pollution'->>'water')::float, 0),
            pollution_soil     = COALESCE((snapshot->'environment'->'pollution'->>'soil')::float, 0),
            government_id      = snapshot->'government'->>'id',
            government_name    = snapshot->'government'->>'name',
            infrastructure     = COALESCE(snapshot->'infrastructure', '{}'),
            environment        = COALESCE(snapshot->'environment', '{}'),
            demography         = COALESCE(snapshot->'population'->'demography', '[]'),
            resources          = COALESCE(snapshot->'resources', '{}')
    `);

    // Drop the old monolithic column
    await knex.schema.alterTable('planet_snapshots', function (table) {
        table.dropColumn('snapshot');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    // Re-add the monolithic snapshot column
    await knex.schema.alterTable('planet_snapshots', function (table) {
        table.jsonb('snapshot').notNullable().defaultTo('{}');
    });

    // Reconstruct the snapshot from the resolved columns
    await knex.raw(`
        UPDATE planet_snapshots
        SET snapshot = jsonb_build_object(
            'id',             planet_id,
            'name',           planet_name,
            'position',       position,
            'population',     jsonb_build_object(
                                'demography', demography,
                                'starvationLevel', starvation_level
                              ),
            'environment',    environment,
            'infrastructure', infrastructure,
            'government',     CASE
                                WHEN government_id IS NOT NULL
                                THEN jsonb_build_object('id', government_id, 'name', government_name)
                                ELSE 'null'::jsonb
                              END,
            'resources',      resources
        )
    `);

    // Drop the new columns
    await knex.schema.alterTable('planet_snapshots', function (table) {
        table.dropColumn('planet_name');
        table.dropColumn('position');
        table.dropColumn('starvation_level');
        table.dropColumn('pollution_air');
        table.dropColumn('pollution_water');
        table.dropColumn('pollution_soil');
        table.dropColumn('government_id');
        table.dropColumn('government_name');
        table.dropColumn('infrastructure');
        table.dropColumn('environment');
        table.dropColumn('demography');
        table.dropColumn('resources');
    });
};
