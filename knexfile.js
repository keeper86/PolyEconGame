// Load environment variables from .env with variable expansion support.
// Skip in production — env vars are injected by the container orchestrator
// and dotenv/dotenv-expand may not be present in the standalone bundle's
// node_modules.
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
if (process.env.NODE_ENV !== 'production') {
    const env = dotenv.config();
    dotenvExpand.expand(env);
}

const defaultConfig = (overrideUrl) => ({
    client: 'postgresql',
    connection: {
        connectionString: overrideUrl,
    },
    pool: {
        min: 2,
        max: 100,
    },
    migrations: {
        tableName: 'knex_migrations',
    },
});

const config = {
    development: defaultConfig(
        process.env.DATABASE_URL ||
            `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@localhost:5432/${process.env.POSTGRES_DB}`,
    ),
    production: defaultConfig(process.env.DATABASE_URL),
};

export default config;
