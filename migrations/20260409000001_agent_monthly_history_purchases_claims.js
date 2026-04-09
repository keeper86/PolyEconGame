exports.up = async function (knex) {
    await knex.raw(
        `ALTER TABLE agent_monthly_history ADD COLUMN IF NOT EXISTS purchases DOUBLE PRECISION NOT NULL DEFAULT 0`,
    );
    await knex.raw(
        `ALTER TABLE agent_monthly_history ADD COLUMN IF NOT EXISTS claim_payments DOUBLE PRECISION NOT NULL DEFAULT 0`,
    );
};

exports.down = async function (knex) {
    await knex.raw(`ALTER TABLE agent_monthly_history DROP COLUMN IF EXISTS purchases`);
    await knex.raw(`ALTER TABLE agent_monthly_history DROP COLUMN IF EXISTS claim_payments`);
};
