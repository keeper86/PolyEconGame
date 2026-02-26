// The TypeScript definitions below are automatically generated.
// Do not touch them, or risk, your modifications being lost.

export enum Table {
    AgentSnapshots = 'agent_snapshots',
    KnexMigrations = 'knex_migrations',
    KnexMigrationsLock = 'knex_migrations_lock',
    PlanetSnapshots = 'planet_snapshots',
    UserData = 'user_data',
}

export type Tables = {
    agent_snapshots: AgentSnapshots;
    knex_migrations: KnexMigrations;
    knex_migrations_lock: KnexMigrationsLock;
    planet_snapshots: PlanetSnapshots;
    user_data: UserData;
};

export type AgentSnapshots = {
    tick: number;
    agent_id: string;
    wealth: string;
    storage: Record<string, unknown>;
    production: Record<string, unknown>;
    consumption: Record<string, unknown>;
    agent_summary: unknown;
    created_at: Date | null;
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

export type PlanetSnapshots = {
    tick: number;
    planet_id: string;
    population_total: string;
    created_at: Date | null;
    planet_name: string;
    position: Record<string, unknown>;
    starvation_level: number;
    pollution_air: number;
    pollution_water: number;
    pollution_soil: number;
    government_id: string | null;
    government_name: string | null;
    infrastructure: Record<string, unknown>;
    environment: Record<string, unknown>;
    demography: unknown[];
    resources: Record<string, unknown>;
};

export type UserData = {
    user_id: string;
    email: string;
    has_assessment_published: boolean;
    display_name: string | null;
    avatar: Buffer | null;
};
