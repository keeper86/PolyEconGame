import path from 'node:path';

import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import knex, { type Knex } from 'knex';

import type { GameState } from '../../src/simulation/planet/planet';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';

if (process.env.NODE_ENV !== 'production') {
    const env = dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
    dotenvExpand.expand(env);
}

const connectionString =
    process.env.DATABASE_URL ??
    `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@localhost:5432/${process.env.POSTGRES_DB}`;

const db: Knex = knex({
    client: 'postgresql',
    connection: { connectionString },
    pool: { min: 0, max: 5 },
});

export async function listSnapshotTicks(): Promise<number[]> {
    const rows = await db('game_snapshots').select('tick').orderBy('tick', 'asc');
    return rows.map((row) => Number(row.tick));
}

export async function loadSnapshotFromDb(tick: number): Promise<GameState> {
    const row = await db('game_snapshots').where({ tick: String(tick) }).first();
    if (!row) {
        throw new Error(`no snapshot at tick ${tick}`);
    }
    return deserializeSnapshot(row.snapshot_data as Buffer);
}

export function queryDb(table: string): Knex.QueryBuilder {
    return db(table);
}

export async function closeDb(): Promise<void> {
    await db.destroy();
}
