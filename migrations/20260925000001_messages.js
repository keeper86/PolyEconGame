exports.up = async function (knex) {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await knex.raw('CREATE EXTENSION IF NOT EXISTS unaccent');

    await knex.raw(`
        CREATE OR REPLACE FUNCTION immutable_unaccent(text)
        RETURNS text
        LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
        AS $$ SELECT unaccent('unaccent', $1) $$;
    `);

    await knex.raw(
        `CREATE INDEX idx_user_data_display_name_trgm ON user_data USING gin (immutable_unaccent(lower(display_name)) gin_trgm_ops)`,
    );
    await knex.raw(
        `CREATE INDEX idx_user_data_username_trgm ON user_data USING gin (immutable_unaccent(lower(username)) gin_trgm_ops)`,
    );
    await knex.raw(
        `CREATE INDEX idx_user_data_user_id_trgm ON user_data USING gin (immutable_unaccent(lower(user_id)) gin_trgm_ops)`,
    );

    await knex.raw(`
        CREATE TABLE messages (
            id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            sender_user_id    VARCHAR(255) NOT NULL REFERENCES user_data(user_id) ON DELETE CASCADE,
            recipient_user_id VARCHAR(255) NOT NULL REFERENCES user_data(user_id) ON DELETE CASCADE,
            subject           TEXT        NOT NULL,
            body              TEXT        NOT NULL,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            read_at           TIMESTAMPTZ NULL,
            sender_deleted_at    TIMESTAMPTZ NULL,
            recipient_deleted_at TIMESTAMPTZ NULL
        )
    `);

    await knex.raw(`CREATE INDEX idx_messages_recipient_unread ON messages (recipient_user_id, read_at)`);
    await knex.raw(`CREATE INDEX idx_messages_recipient_created ON messages (recipient_user_id, created_at DESC)`);
    await knex.raw(`CREATE INDEX idx_messages_sender_created ON messages (sender_user_id, created_at DESC)`);
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('messages');
    await knex.raw('DROP INDEX IF EXISTS idx_user_data_display_name_trgm');
    await knex.raw('DROP INDEX IF EXISTS idx_user_data_username_trgm');
    await knex.raw('DROP INDEX IF EXISTS idx_user_data_user_id_trgm');
    await knex.raw('DROP FUNCTION IF EXISTS immutable_unaccent(text)');
    await knex.raw('DROP EXTENSION IF EXISTS unaccent');
    await knex.raw('DROP EXTENSION IF EXISTS pg_trgm');
};
