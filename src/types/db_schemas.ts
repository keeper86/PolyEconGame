// The TypeScript definitions below are automatically generated.
// Do not touch them, or risk, your modifications being lost.

export enum Table {
    KnexMigrations = 'knex_migrations',
    KnexMigrationsLock = 'knex_migrations_lock',
    UserData = 'user_data',
    PlanetSnapshots = 'planet_snapshots',
    AgentSnapshots = 'agent_snapshots',
}

export type Tables = {
    knex_migrations: KnexMigrations;
    knex_migrations_lock: KnexMigrationsLock;
    user_data: UserData;
    planet_snapshots: PlanetSnapshot;
    agent_snapshots: AgentSnapshot;
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

export type PlanetSnapshot = {
    tick: number;
    planet_id: string;
    population_total: number;
    snapshot: object;
    created_at: Date | null;
};

export type AgentSnapshot = {
    tick: number;
    agent_id: string;
    wealth: number;
    storage: object;
    production: object;
    consumption: object;
    agent_summary: object;
    created_at: Date | null;
};
