// The TypeScript definitions below are automatically generated.
// Do not touch them, or risk, your modifications being lost.

export enum Table {
    GameSnapshots = 'game_snapshots',
    KnexMigrations = 'knex_migrations',
    KnexMigrationsLock = 'knex_migrations_lock',
    UserData = 'user_data',
}

export type Tables = {
    game_snapshots: GameSnapshots;
    knex_migrations: KnexMigrations;
    knex_migrations_lock: KnexMigrationsLock;
    user_data: UserData;
};

export type GameSnapshots = {
    id: string;
    tick: string;
    created_at: Date;
    game_id: number;
    snapshot_data: Buffer;
};

export type KnexMigrations = {
    id: number;
    name: string | null;
    batch: number | null;
    migration_time: Date | null;
};

export type KnexMigrationsLock = {
    index: number;
    is_locked: number | null;
};

export type UserData = {
    user_id: string;
    email: string;
    has_assessment_published: boolean;
    display_name: string | null;
    avatar: Buffer | null;
};
