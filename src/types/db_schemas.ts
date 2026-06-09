export enum Table {
    AgentDecadeSummary = 'agent_decade_summary',
    AgentMonthlyHistory = 'agent_monthly_history',
    AgentMonthlySummary = 'agent_monthly_summary',
    AgentYearlySummary = 'agent_yearly_summary',
    GameSnapshots = 'game_snapshots',
    KnexMigrations = 'knex_migrations',
    KnexMigrationsLock = 'knex_migrations_lock',
    PlanetEconomyDecade = 'planet_economy_decade',
    PlanetEconomyHistory = 'planet_economy_history',
    PlanetEconomyMonthly = 'planet_economy_monthly',
    PlanetEconomyYearly = 'planet_economy_yearly',
    PlanetPopulationDecade = 'planet_population_decade',
    PlanetPopulationHistory = 'planet_population_history',
    PlanetPopulationMonthly = 'planet_population_monthly',
    PlanetPopulationYearly = 'planet_population_yearly',
    ProductPriceDecade = 'product_price_decade',
    ProductPriceHistory = 'product_price_history',
    ProductPriceMonthly = 'product_price_monthly',
    ProductPriceYearly = 'product_price_yearly',
    UserData = 'user_data',
}

export type Tables = {
    agent_decade_summary: AgentDecadeSummary;
    agent_monthly_history: AgentMonthlyHistory;
    agent_monthly_summary: AgentMonthlySummary;
    agent_yearly_summary: AgentYearlySummary;
    game_snapshots: GameSnapshots;
    knex_migrations: KnexMigrations;
    knex_migrations_lock: KnexMigrationsLock;
    planet_economy_decade: PlanetEconomyDecade;
    planet_economy_history: PlanetEconomyHistory;
    planet_economy_monthly: PlanetEconomyMonthly;
    planet_economy_yearly: PlanetEconomyYearly;
    planet_population_decade: PlanetPopulationDecade;
    planet_population_history: PlanetPopulationHistory;
    planet_population_monthly: PlanetPopulationMonthly;
    planet_population_yearly: PlanetPopulationYearly;
    product_price_decade: ProductPriceDecade;
    product_price_history: ProductPriceHistory;
    product_price_monthly: ProductPriceMonthly;
    product_price_yearly: ProductPriceYearly;
    user_data: UserData;
};

export type AgentDecadeSummary = {
    bucket: string | null;
    planet_id: string | null;
    agent_id: string | null;
    avg_net_balance: number | null;
    avg_monthly_net_income: number | null;
    avg_total_workers: number | null;
    avg_wages: number | null;
    sum_production_value: number | null;
    sum_consumption_value: number | null;
    sum_purchases: number | null;
    sum_claim_payments: number | null;
};

export type AgentMonthlyHistory = {
    tick: string;
    planet_id: string;
    agent_id: string;
    net_balance: number;
    monthly_net_income: number;
    total_workers: number;
    wages: number | null;
    production_value: number | null;
    consumption_value: number | null;
    purchases: number | null;
    claim_payments: number | null;
    facility_count: number | null;
    storage_value: number | null;
    created_at: Date;
};

export type AgentMonthlySummary = {
    bucket: string | null;
    planet_id: string | null;
    agent_id: string | null;
    avg_net_balance: number | null;
    avg_monthly_net_income: number | null;
    avg_total_workers: number | null;
    avg_wages: number | null;
    sum_production_value: number | null;
    sum_consumption_value: number | null;
    sum_purchases: number | null;
    sum_claim_payments: number | null;
    avg_facility_count: number | null;
    avg_storage_value: number | null;
};

export type AgentYearlySummary = {
    bucket: string | null;
    planet_id: string | null;
    agent_id: string | null;
    avg_net_balance: number | null;
    avg_monthly_net_income: number | null;
    avg_total_workers: number | null;
    avg_wages: number | null;
    sum_production_value: number | null;
    sum_consumption_value: number | null;
    sum_purchases: number | null;
    sum_claim_payments: number | null;
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

export type PlanetEconomyDecade = {
    bucket: string | null;
    planet_id: string | null;
    avg_gdp: number | null;
    avg_cost_of_living: number | null;
    avg_cost_of_living_rich: number | null;
    avg_wage_edu0: number | null;
    avg_wage_edu1: number | null;
    avg_wage_edu2: number | null;
    avg_wage_edu3: number | null;
    avg_policy_rate: number | null;
    avg_bank_equity: number | null;
    avg_money_supply: number | null;
};

export type PlanetEconomyHistory = {
    tick: string;
    planet_id: string;
    gdp: number;
    cost_of_living: number;
    cost_of_living_rich: number;
    wage_edu0: number;
    wage_edu1: number;
    wage_edu2: number;
    wage_edu3: number;
    policy_rate: number;
    bank_equity: number;
    money_supply: number;
    created_at: Date;
};

export type PlanetEconomyMonthly = {
    bucket: string | null;
    planet_id: string | null;
    avg_gdp: number | null;
    avg_cost_of_living: number | null;
    avg_cost_of_living_rich: number | null;
    avg_wage_edu0: number | null;
    avg_wage_edu1: number | null;
    avg_wage_edu2: number | null;
    avg_wage_edu3: number | null;
    avg_policy_rate: number | null;
    avg_bank_equity: number | null;
    avg_money_supply: number | null;
};

export type PlanetEconomyYearly = {
    bucket: string | null;
    planet_id: string | null;
    avg_gdp: number | null;
    avg_cost_of_living: number | null;
    avg_cost_of_living_rich: number | null;
    avg_wage_edu0: number | null;
    avg_wage_edu1: number | null;
    avg_wage_edu2: number | null;
    avg_wage_edu3: number | null;
    avg_policy_rate: number | null;
    avg_bank_equity: number | null;
    avg_money_supply: number | null;
};

export type PlanetPopulationDecade = {
    bucket: string | null;
    planet_id: string | null;
    avg_population: number | null;
};

export type PlanetPopulationHistory = {
    tick: string;
    planet_id: string;
    population: string;
    created_at: Date;
};

export type PlanetPopulationMonthly = {
    bucket: string | null;
    planet_id: string | null;
    avg_population: number | null;
};

export type PlanetPopulationYearly = {
    bucket: string | null;
    planet_id: string | null;
    avg_population: number | null;
};

export type ProductPriceDecade = {
    bucket: string | null;
    planet_id: string | null;
    product_name: string | null;
    avg_price: number | null;
    min_price: number | null;
    max_price: number | null;
};

export type ProductPriceHistory = {
    tick: string;
    planet_id: string;
    product_name: string;
    avg_price: number;
    min_price: number;
    max_price: number;
    created_at: Date;
};

export type ProductPriceMonthly = {
    bucket: string | null;
    planet_id: string | null;
    product_name: string | null;
    avg_price: number | null;
    min_price: number | null;
    max_price: number | null;
};

export type ProductPriceYearly = {
    bucket: string | null;
    planet_id: string | null;
    product_name: string | null;
    avg_price: number | null;
    min_price: number | null;
    max_price: number | null;
};

export type UserData = {
    user_id: string;
    email: string;
    has_assessment_published: boolean;
    display_name: string | null;
    agent_id: string | null;
    avatar: Buffer | null;
};
