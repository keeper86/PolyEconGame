import type { Knex } from 'knex';
import type {
    AgentMonthlyHistory,
    GameSnapshots,
    PlanetPopulationHistory,
    ProductPriceHistory,
} from '../types/db_schemas';

export type GameSnapshotRow = GameSnapshots;

export interface InsertGameSnapshot {
    tick: number;

    game_id?: number;
    snapshot_data: Buffer;
}

export async function insertGameSnapshot(db: Knex, snapshot: InsertGameSnapshot): Promise<void> {
    await db('game_snapshots').insert({
        tick: String(snapshot.tick),
        game_id: snapshot.game_id ?? 1,
        snapshot_data: snapshot.snapshot_data,
    });
}

export async function getLatestGameSnapshot(db: Knex): Promise<GameSnapshotRow | null> {
    const row = await db('game_snapshots').orderBy('tick', 'desc').first();
    return (row as GameSnapshotRow) ?? null;
}

export async function getGameSnapshotByTick(db: Knex, tick: number): Promise<GameSnapshotRow | null> {
    const row = await db('game_snapshots')
        .where({ tick: String(tick) })
        .first();
    return (row as GameSnapshotRow) ?? null;
}

export async function pruneGameSnapshots(db: Knex, keepCount: number): Promise<number> {
    if (keepCount <= 0) {
        return 0;
    }

    const rows = await db('game_snapshots').orderBy('tick', 'desc').limit(keepCount).select('tick');

    if (rows.length < keepCount) {
        return 0;
    }

    const cutoffTick = Number(rows[rows.length - 1].tick);

    const deleted = await db('game_snapshots').where('tick', '<', cutoffTick).del();
    return deleted;
}

export interface InsertPlanetPopulation {
    tick: number;
    planet_id: string;
    population: number;
    grocery_buffer: number;
    healthcare_buffer: number;
    logistics_buffer: number;
    education_buffer: number;
    retail_buffer: number;
}

export async function insertPlanetPopulationHistory(db: Knex, rows: InsertPlanetPopulation[]): Promise<void> {
    if (rows.length === 0) {
        return;
    }
    await db('planet_population_history').insert(
        rows.map((r) => ({
            tick: String(r.tick),
            planet_id: r.planet_id,
            population: String(Math.round(r.population)),
            grocery_buffer: r.grocery_buffer,
            healthcare_buffer: r.healthcare_buffer,
            logistics_buffer: r.logistics_buffer,
            education_buffer: r.education_buffer,
            retail_buffer: r.retail_buffer,
        })),
    );
}

export async function getLatestPlanetPopulations(db: Knex) {
    return db
        .raw(
            `SELECT DISTINCT ON (planet_id) *
         FROM planet_population_history
         ORDER BY planet_id, tick DESC`,
        )
        .then((res: { rows: PlanetPopulationHistory[] }) => res.rows);
}

export type AgentMonthlyHistoryRow = AgentMonthlyHistory;

export interface InsertAgentMonthlyHistory {
    tick: number;
    planet_id: string;
    agent_id: string;
    net_balance: number;
    asset_value: number;
    monthly_net_income: number;
    total_workers: number;
    wages: number;
    production_value: number;
    consumption_value: number;
    facility_count: number;
    storage_value: number;
    purchases: number;
    claim_payments: number;
}

export async function insertAgentMonthlyHistory(db: Knex, rows: InsertAgentMonthlyHistory[]): Promise<void> {
    if (rows.length === 0) {
        return;
    }
    await db('agent_monthly_history').insert(
        rows.map((r) => ({
            tick: String(r.tick),
            planet_id: r.planet_id,
            agent_id: r.agent_id,
            net_balance: r.net_balance,
            asset_value: r.asset_value,
            monthly_net_income: r.monthly_net_income,
            total_workers: r.total_workers,
            wages: r.wages,
            production_value: r.production_value,
            consumption_value: r.consumption_value,
            facility_count: r.facility_count,
            storage_value: r.storage_value,
            purchases: r.purchases,
            claim_payments: r.claim_payments,
        })),
    );
}

export async function getLatestAgentMonthlyHistoryByPlanet(
    db: Knex,
    planetId: string,
): Promise<AgentMonthlyHistoryRow[]> {
    return db
        .raw(
            `SELECT DISTINCT ON (agent_id) *
         FROM agent_monthly_history
         WHERE planet_id = ?
         ORDER BY agent_id, tick DESC`,
            [planetId],
        )
        .then((res: { rows: AgentMonthlyHistoryRow[] }) => res.rows);
}

export type ProductPriceHistoryRow = ProductPriceHistory;

export interface InsertProductPrice {
    tick: number;
    planet_id: string;
    product_name: string;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
}

export async function insertProductPriceHistory(db: Knex, rows: InsertProductPrice[]): Promise<void> {
    if (rows.length === 0) {
        return;
    }
    await db('product_price_history').insert(
        rows.map((r) => ({
            tick: String(r.tick),
            planet_id: r.planet_id,
            product_name: r.product_name,
            avg_price: r.avgPrice,
            min_price: r.minPrice,
            max_price: r.maxPrice,
        })),
    );
}

export type HistoryGranularity = 'monthly' | 'yearly' | 'decade';

export interface ProductPriceBucket {
    bucket: string;
    planet_id: string;
    product_name: string;
    avg_price: number;
    min_price: number;
    max_price: number;
}

export async function getProductPriceHistory(
    db: Knex,
    planetId: string,
    productName: string,
    granularity: HistoryGranularity = 'monthly',
    limit: number = 100,
): Promise<ProductPriceBucket[]> {
    const view =
        granularity === 'decade'
            ? 'product_price_decade'
            : granularity === 'yearly'
              ? 'product_price_yearly'
              : 'product_price_monthly';

    return db(view)
        .where({ planet_id: planetId, product_name: productName })
        .orderBy('bucket', 'desc')
        .limit(limit)
        .select('bucket', 'planet_id', 'product_name', 'avg_price', 'min_price', 'max_price');
}

export async function refreshContinuousAggregates(
    db: Knex,
    upToTick: number,
    granularity: 'monthly' | 'yearly' | 'decade',
): Promise<void> {
    const views =
        granularity === 'decade'
            ? ['product_price_decade', 'planet_population_decade', 'agent_decade_summary', 'planet_economy_decade']
            : granularity === 'yearly'
              ? ['product_price_yearly', 'planet_population_yearly', 'agent_yearly_summary', 'planet_economy_yearly']
              : [
                    'product_price_monthly',
                    'planet_population_monthly',
                    'agent_monthly_summary',
                    'planet_economy_monthly',
                ];

    const ticksPerBucket = granularity === 'decade' ? 3600 : granularity === 'yearly' ? 360 : 30;
    const refreshStartTick = Math.max(0, upToTick - ticksPerBucket * 2);
    for (const view of views) {
        await db.raw(`CALL refresh_continuous_aggregate(?, ?::bigint, ?::bigint)`, [view, refreshStartTick, upToTick]);
    }
}

export interface PopulationBucket {
    bucket: string;
    planet_id: string;
    avg_population: number;
}

export interface BufferBucket {
    bucket: string;
    planet_id: string;
    avg_population: number;
    avg_grocery_buffer: number;
    avg_healthcare_buffer: number;
    avg_logistics_buffer: number;
    avg_education_buffer: number;
    avg_retail_buffer: number;
}

export async function getPlanetBufferHistory(
    db: Knex,
    planetId: string,
    granularity: HistoryGranularity = 'monthly',
    limit: number = 100,
): Promise<BufferBucket[]> {
    const view =
        granularity === 'decade'
            ? 'planet_population_decade'
            : granularity === 'yearly'
              ? 'planet_population_yearly'
              : 'planet_population_monthly';

    return db(view)
        .where({ planet_id: planetId })
        .orderBy('bucket', 'desc')
        .limit(limit)
        .select(
            'bucket',
            'planet_id',
            'avg_population',
            'avg_grocery_buffer',
            'avg_healthcare_buffer',
            'avg_logistics_buffer',
            'avg_education_buffer',
            'avg_retail_buffer',
        );
}

export async function getPlanetPopulationHistoryAggregated(
    db: Knex,
    planetId: string,
    granularity: HistoryGranularity = 'monthly',
    limit: number = 100,
): Promise<PopulationBucket[]> {
    const view =
        granularity === 'decade'
            ? 'planet_population_decade'
            : granularity === 'yearly'
              ? 'planet_population_yearly'
              : 'planet_population_monthly';

    return db(view)
        .where({ planet_id: planetId })
        .orderBy('bucket', 'desc')
        .limit(limit)
        .select('bucket', 'planet_id', 'avg_population');
}

export interface AgentSummaryBucket {
    bucket: string;
    planet_id: string;
    agent_id: string;
    avg_net_balance: number;
    avg_asset_value: number;
    avg_monthly_net_income: number;
    avg_total_workers: number;
    avg_wages: number;
    sum_production_value: number;
    sum_consumption_value: number;
}

export interface AgentFinancialBucket {
    bucket: string;
    avg_net_balance: number;
    avg_asset_value: number;
    avg_monthly_net_income: number;
    avg_wages: number;
    sum_purchases: number;
    sum_claim_payments: number;
}

export async function getAgentHistoryAggregated(
    db: Knex,
    agentId: string,
    planetId: string,
    granularity: HistoryGranularity = 'monthly',
    limit: number = 100,
): Promise<AgentSummaryBucket[]> {
    const view =
        granularity === 'decade'
            ? 'agent_decade_summary'
            : granularity === 'yearly'
              ? 'agent_yearly_summary'
              : 'agent_monthly_summary';

    return db(view)
        .where({ agent_id: agentId, planet_id: planetId })
        .orderBy('bucket', 'desc')
        .limit(limit)
        .select(
            'bucket',
            'planet_id',
            'agent_id',
            'avg_net_balance',
            'avg_asset_value',
            'avg_monthly_net_income',
            'avg_total_workers',
            'avg_wages',
            'sum_production_value',
            'sum_consumption_value',
        );
}

export async function getAgentFinancialHistoryAggregated(
    db: Knex,
    agentId: string,
    planetId: string,
    granularity: HistoryGranularity = 'monthly',
    limit: number = 26,
): Promise<AgentFinancialBucket[]> {
    const view =
        granularity === 'decade'
            ? 'agent_decade_summary'
            : granularity === 'yearly'
              ? 'agent_yearly_summary'
              : 'agent_monthly_summary';

    return db(view)
        .where({ agent_id: agentId, planet_id: planetId })
        .orderBy('bucket', 'desc')
        .limit(limit)
        .select(
            'bucket',
            'avg_net_balance',
            'avg_asset_value',
            'avg_monthly_net_income',
            'avg_wages',
            'sum_purchases',
            'sum_claim_payments',
        );
}

export interface InsertPlanetEconomy {
    tick: number;
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
}

export interface PlanetEconomyBucket {
    bucket: string;
    planet_id: string;
    avg_gdp: number;
    avg_cost_of_living: number;
    avg_cost_of_living_rich: number;
    avg_wage_edu0: number;
    avg_wage_edu1: number;
    avg_wage_edu2: number;
    avg_wage_edu3: number;
    avg_policy_rate: number;
    avg_bank_equity: number;
    avg_money_supply: number;
}

export async function insertPlanetEconomyHistory(db: Knex, rows: InsertPlanetEconomy[]): Promise<void> {
    if (rows.length === 0) {
        return;
    }
    await db('planet_economy_history').insert(
        rows.map((r) => ({
            tick: String(r.tick),
            planet_id: r.planet_id,
            gdp: r.gdp,
            cost_of_living: r.cost_of_living,
            cost_of_living_rich: r.cost_of_living_rich,
            wage_edu0: r.wage_edu0,
            wage_edu1: r.wage_edu1,
            wage_edu2: r.wage_edu2,
            wage_edu3: r.wage_edu3,
            policy_rate: r.policy_rate,
            bank_equity: r.bank_equity,
            money_supply: r.money_supply,
        })),
    );
}

export async function getPlanetEconomyHistoryAggregated(
    db: Knex,
    planetId: string,
    granularity: HistoryGranularity = 'monthly',
    limit: number = 100,
): Promise<PlanetEconomyBucket[]> {
    const view =
        granularity === 'decade'
            ? 'planet_economy_decade'
            : granularity === 'yearly'
              ? 'planet_economy_yearly'
              : 'planet_economy_monthly';

    return db(view)
        .where({ planet_id: planetId })
        .orderBy('bucket', 'desc')
        .limit(limit)
        .select(
            'bucket',
            'planet_id',
            'avg_gdp',
            'avg_cost_of_living',
            'avg_cost_of_living_rich',
            'avg_wage_edu0',
            'avg_wage_edu1',
            'avg_wage_edu2',
            'avg_wage_edu3',
            'avg_policy_rate',
            'avg_bank_equity',
            'avg_money_supply',
        );
}
