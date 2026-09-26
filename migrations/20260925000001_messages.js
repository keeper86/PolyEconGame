exports.up = async function (knex) {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await knex.raw('CREATE EXTENSION IF NOT EXISTS unaccent');

    await knex.raw(`
        CREATE TABLE messages (
            id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            sender_user_id    TEXT        NOT NULL,
            recipient_user_id TEXT        NOT NULL,
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
    await knex.raw('DROP EXTENSION IF EXISTS unaccent');
    await knex.raw('DROP EXTENSION IF EXISTS pg_trgm');
};
