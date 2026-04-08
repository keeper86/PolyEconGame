/**
 * server/gameSnapshotRepository.ts
 *
 * Repository layer for reading and writing sparse cold game snapshots
 * and planet population history.
 *
 * Cold snapshots: MessagePack-serialized blobs of the full GameState,
 * stored periodically (e.g. every 360 ticks) for crash recovery.
 *
 * Population history: lightweight rows (tick | planet_id | population)
 * written alongside each cold snapshot so long-term population trends
 * can be queried without deserializing the full blob.
 */

import type { Knex } from 'knex';
import type {
    AgentMonthlyHistory,
    GameSnapshots,
    PlanetPopulationHistory,
    ProductPriceHistory,
} from '../types/db_schemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GameSnapshotRow = GameSnapshots;

export interface InsertGameSnapshot {
    tick: number;
    /** Optional game id for multi-game setups. Defaults to 1. */
    game_id?: number;
    snapshot_data: Buffer;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Insert a new cold snapshot row.
 */
export async function insertGameSnapshot(db: Knex, snapshot: InsertGameSnapshot): Promise<void> {
    await db('game_snapshots').insert({
        tick: String(snapshot.tick),
        game_id: snapshot.game_id ?? 1,
        snapshot_data: snapshot.snapshot_data,
    });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Get the most recent cold snapshot (by tick DESC).
 * Returns `null` if no snapshots exist.
 */
export async function getLatestGameSnapshot(db: Knex): Promise<GameSnapshotRow | null> {
    const row = await db('game_snapshots').orderBy('tick', 'desc').first();
    return (row as GameSnapshotRow) ?? null;
}

/**
 * Get a snapshot for a specific tick.
 */
export async function getGameSnapshotByTick(db: Knex, tick: number): Promise<GameSnapshotRow | null> {
    const row = await db('game_snapshots')
        .where({ tick: String(tick) })
        .first();
    return (row as GameSnapshotRow) ?? null;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Delete all snapshots except the N most recent (by tick DESC).
 * Useful for keeping the table small.
 */
export async function pruneGameSnapshots(db: Knex, keepCount: number): Promise<number> {
    if (keepCount <= 0) {
        return 0;
    }

    // Get the tick of the Nth most recent snapshot
    const rows = await db('game_snapshots').orderBy('tick', 'desc').limit(keepCount).select('tick');

    if (rows.length < keepCount) {
        // Fewer snapshots than keepCount — nothing to prune.
        return 0;
    }

    const cutoffTick = Number(rows[rows.length - 1].tick);

    const deleted = await db('game_snapshots').where('tick', '<', cutoffTick).del();
    return deleted;
}

// ---------------------------------------------------------------------------
// Planet population history
// ---------------------------------------------------------------------------

export interface InsertPlanetPopulation {
    tick: number;
    planet_id: string;
    population: number;
}

/**
 * Insert one population-history row per planet for a given tick.
 * Uses a single multi-row insert for efficiency.
 */
export async function insertPlanetPopulationHistory(db: Knex, rows: InsertPlanetPopulation[]): Promise<void> {
    if (rows.length === 0) {
        return;
    }
    await db('planet_population_history').insert(
        rows.map((r) => ({
            tick: String(r.tick),
            planet_id: r.planet_id,
            population: String(r.population),
        })),
    );
}

/**
 * Get the most recent population row for every planet (latest tick).
 */
export async function getLatestPlanetPopulations(db: Knex) {
    // Use a DISTINCT ON query to efficiently fetch the latest row per planet.
    return db
        .raw(
            `SELECT DISTINCT ON (planet_id) *
         FROM planet_population_history
         ORDER BY planet_id, tick DESC`,
        )
        .then((res: { rows: PlanetPopulationHistory[] }) => res.rows);
}

// ---------------------------------------------------------------------------
// Agent monthly history
// ---------------------------------------------------------------------------

export type AgentMonthlyHistoryRow = AgentMonthlyHistory;

export interface InsertAgentMonthlyHistory {
    tick: number;
    planet_id: string;
    agent_id: string;
    net_balance: number;
    monthly_net_income: number;
    total_workers: number;
    wages: number;
    production_value: number;
    facility_count: number;
    storage_value: number;
}

/**
 * Insert agent monthly history rows.
 * Records per-agent metrics at month boundaries (every 30 ticks).
 */
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
            monthly_net_income: r.monthly_net_income,
            total_workers: r.total_workers,
            wages: r.wages,
            production_value: r.production_value,
            facility_count: r.facility_count,
            storage_value: r.storage_value,
        })),
    );
}

/**
 * Get the full monthly history for a specific agent, ordered by tick descending.
 */
export async function getAgentMonthlyHistory(
    db: Knex,
    agentId: string,
    limit: number = 100,
): Promise<AgentMonthlyHistoryRow[]> {
    return db('agent_monthly_history')
        .where({ agent_id: agentId })
        .orderBy('tick', 'desc')
        .limit(limit)
        .select() as Promise<AgentMonthlyHistoryRow[]>;
}

/**
 * Get the most recent monthly history row for every agent on a planet (latest tick).
 */
export async function getLatestAgentMonthlyHistoryByPlanet(
    db: Knex,
    planetId: string,
): Promise<AgentMonthlyHistoryRow[]> {
    // Use a DISTINCT ON query to efficiently fetch the latest row per agent
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

// ---------------------------------------------------------------------------
// Product price history
// ---------------------------------------------------------------------------

export type ProductPriceHistoryRow = ProductPriceHistory;

export interface InsertProductPrice {
    tick: number;
    planet_id: string;
    product_name: string;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
}

/**
 * Insert one aggregated price row per product per planet at month boundaries.
 * Each row contains the intra-month avg/min/max computed in the worker accumulator.
 * TimescaleDB continuous aggregates cascade these into yearly / decade views.
 */
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

// ---------------------------------------------------------------------------
// Tiered history query helpers
// ---------------------------------------------------------------------------

export type HistoryGranularity = 'monthly' | 'yearly' | 'decade';

export interface ProductPriceBucket {
    bucket: string; // tick bucket start, as string
    planet_id: string;
    product_name: string;
    avg_price: number;
    min_price: number;
    max_price: number;
}

/**
 * Query product price history from the appropriate continuous aggregate based
 * on requested granularity.
 */
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

/**
 * Manually refresh continuous aggregate views up to the given tick.
 *
 * Called from the worker at tick boundaries so the cascaded CAGGs
 * (monthly → yearly → decade) stay current without a background scheduler.
 *
 * @param granularity  Which tier(s) to refresh. Monthly must be refreshed
 *   before yearly, yearly before decade (cagg cascade order).
 */
export async function refreshContinuousAggregates(
    db: Knex,
    upToTick: number,
    granularity: 'monthly' | 'yearly' | 'decade',
): Promise<void> {
    const views =
        granularity === 'decade'
            ? ['product_price_decade', 'planet_population_decade', 'agent_decade_summary']
            : granularity === 'yearly'
              ? ['product_price_yearly', 'planet_population_yearly', 'agent_yearly_summary']
              : ['product_price_monthly', 'planet_population_monthly', 'agent_monthly_summary'];

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

/**
 * Query planet population history from the appropriate continuous aggregate.
 */
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
    avg_monthly_net_income: number;
    avg_total_workers: number;
    avg_wages: number;
    sum_production_value: number;
}

/**
 * Query agent history from the appropriate continuous aggregate.
 */
export async function getAgentHistoryAggregated(
    db: Knex,
    agentId: string,
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
        .where({ agent_id: agentId })
        .orderBy('bucket', 'desc')
        .limit(limit)
        .select(
            'bucket',
            'planet_id',
            'agent_id',
            'avg_net_balance',
            'avg_monthly_net_income',
            'avg_total_workers',
            'avg_wages',
            'sum_production_value',
        );
}
