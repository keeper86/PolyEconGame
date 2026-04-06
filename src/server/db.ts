import type { Tables } from '@/types/db_schemas';
import type { Knex } from 'knex';
import knex from 'knex';
import config from '../../knexfile';

const isDevelopment = process.env.NODE_ENV === 'development';

const databaseConfig: Knex.Config = isDevelopment ? config.development : config.production;

// Use a globalThis-backed singleton so that Next.js hot-module reloads in
// development don't create a new connection pool on every re-evaluation of
// this module, which would leak connections and exhaust max_connections.
const GLOBAL_KEY = Symbol.for('__polyecon_db__');
const g = globalThis as unknown as { [GLOBAL_KEY]?: Knex<Tables> };

if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = knex<Tables>(databaseConfig);
}

export const db: Knex<Tables> = g[GLOBAL_KEY]!;
