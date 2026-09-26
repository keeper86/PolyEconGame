exports.up = async function (knex) {
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
    await knex.raw(
        `CREATE INDEX idx_messages_conversation ON messages (sender_user_id, recipient_user_id, created_at DESC)`,
    );
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('messages');
};
