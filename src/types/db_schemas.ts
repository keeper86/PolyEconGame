// The TypeScript definitions below are automatically generated.
// Do not touch them, or risk, your modifications being lost.

export enum Table {
    GameSnapshots = 'game_snapshots',
    KnexMigrations = 'knex_migrations',
    KnexMigrationsLock = 'knex_migrations_lock',
    PlanetPopulationHistory = 'planet_population_history',
    UserData = 'user_data',
}

export type Tables = {
    game_snapshots: GameSnapshots;
    knex_migrations: KnexMigrations;
    knex_migrations_lock: KnexMigrationsLock;
    planet_population_history: PlanetPopulationHistory;
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

export type PlanetPopulationHistory = {
    id: string;
    tick: string;
    planet_id: string;
    population: string;
    starvation_level: number;
    food_price: number;
    created_at: Date;
};

export type UserData = {
    user_id: string;
    email: string;
    has_assessment_published: boolean;
    display_name: string | null;
    agent_id: string | null;
    avatar: Buffer | null;
};
