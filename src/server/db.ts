import type { Tables } from '@/types/db_schemas';
import type { Knex } from 'knex';
import knex from 'knex';
import config from '../../knexfile';

const isDevelopment = process.env.NODE_ENV === 'development';

const databaseConfig: Knex.Config = isDevelopment ? config.development : config.production;

const GLOBAL_KEY = Symbol.for('__polyecon_db__');
const g = globalThis as unknown as { [GLOBAL_KEY]?: Knex<Tables> };

if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = knex<Tables>(databaseConfig);
}

export const db: Knex<Tables> = g[GLOBAL_KEY]!;
