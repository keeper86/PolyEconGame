import { parentPort, workerData, type MessagePort } from 'node:worker_threads';
import knexConfig from '../../knexfile.js';
import { advanceTick, seedRng } from './engine';
import { computeLoanConditions } from './financial/loanConditions';
import {
    getLatestGameSnapshot,
    insertAgentMonthlyHistory,
    insertGameSnapshot,
    insertPlanetPopulationHistory,
    insertProductPriceHistory,
    pruneGameSnapshots,
    refreshContinuousAggregates,
} from './gameSnapshotRepository';
import { fromImmutableGameState, toImmutableGameState, type GameStateRecord } from './immutableTypes';
import type { GameState } from './planet/planet';

import type { WorkerQueryMessage } from './queries';
import { deserializeSnapshot, serializeGameState } from './snapshotCompression';
import { SNAPSHOT_INTERVAL_TICKS, SNAPSHOT_MAX_RETAINED } from './snapshotConfig';
import { TICKS_PER_MONTH, TICKS_PER_YEAR } from './constants';
import { computePopulationTotal } from './snapshotRepository';
import { createInitialGameState } from './utils/initialWorld';
import { handleAgentAction } from './workerClient/agentActions';
import { handleFacilityAction } from './workerClient/facilityActions';
import {
    handlePostTransportContract,
    handleAcceptTransportContract,
    handleCancelTransportContract,
    handleDispatchShip,
    handleDispatchConstructionShip,
    handlePostConstructionContract,
    handleAcceptConstructionContract,
    handleCancelConstructionContract,
    handlePostShipBuyingOffer,
    handleAcceptShipBuyingOffer,
    handlePostShipListing,
    handleCancelShipListing,
    handleAcceptShipListing,
} from './workerClient/shipContractActions';
import { handleAcquireLicense } from './workerClient/licenseActions';
import { handleFinancialAction } from './workerClient/financialActions';
import { handleMarketAction } from './workerClient/marketActions';
import type { InboundMessage, OutboundMessage, PendingAction } from './workerClient/messages';
import { handleResourceAction } from './workerClient/resourceActions';
export type { InboundMessage, OutboundMessage, PendingAction } from './workerClient/messages';

interface TaskPayload {
    command: string;
    port?: MessagePort;
}

export default async function simulationTask(task: TaskPayload): Promise<void> {
    // -----------------------------------------------------------------
    // Messaging channel
    //
    // Piscina owns `parentPort` for its internal task dispatch protocol.
    // We use a dedicated MessagePort (passed in the task payload) for all
    // custom communication.  If no port was provided (e.g. in tests that
    // don't use the full workerManager), fall back to parentPort.
    // -----------------------------------------------------------------

    const messagePort = task.port ?? parentPort;

    // -----------------------------------------------------------------
    // Database connection (for snapshot persistence & recovery)
    // -----------------------------------------------------------------

    let snapshotDb: import('knex').Knex | null = null;

    async function getSnapshotDb(): Promise<import('knex').Knex | null> {
        if (snapshotDb) {
            return snapshotDb;
        }
        try {
            // Use dynamic import() for knex itself so this works in both
            // the dev (tsx/ts-node) environment and the esbuild ESM bundle
            // (.next/standalone/worker.mjs) where `require` is not available.
            const { default: knexModule } = await import('knex');
            const isDevelopment = process.env.NODE_ENV === 'development';
            const dbConfig = isDevelopment ? knexConfig.development : knexConfig.production;

            if (!dbConfig) {
                console.warn('[worker] No knex config found — snapshot persistence disabled');
                return null;
            }

            snapshotDb = knexModule({
                ...dbConfig,
                pool: { min: 1, max: 2 }, // smaller pool for the worker
            });
            return snapshotDb;
        } catch (err) {
            console.warn('[worker] Failed to create snapshot DB pool:', err);
            return null;
        }
    }

    // -----------------------------------------------------------------
    // State  (private to this worker invocation)
    // -----------------------------------------------------------------

    const TICK_INTERVAL_MS: number = typeof workerData?.tickIntervalMs === 'number' ? workerData.tickIntervalMs : 0;

    // Seed the stochastic rounding PRNG for reproducibility.
    // Using a fixed seed ensures identical simulation runs for the same
    // starting conditions.  A future enhancement could persist and restore
    // the seed for save/load support.
    seedRng(42);

    // -----------------------------------------------------------------
    // Recovery bootstrap — attempt to restore from the latest cold snapshot
    // -----------------------------------------------------------------

    let state: GameState;
    let currentSnapshot: GameStateRecord;
    let recovered = false;

    try {
        const db = await getSnapshotDb();
        if (db) {
            const latestRow = await getLatestGameSnapshot(db);
            if (latestRow) {
                const record = deserializeSnapshot(latestRow.snapshot_data);
                state = fromImmutableGameState(record);
                currentSnapshot = record;
                recovered = true;
                console.log(
                    `[worker] Recovered from cold snapshot at tick ${state.tick} ` +
                        `(game ${latestRow.game_id}, ${(latestRow.snapshot_data.length / 1024).toFixed(1)} KB)`,
                );
            }
        }
    } catch (err) {
        console.error('[worker] Snapshot recovery failed — starting fresh:', err);
    }

    if (!recovered) {
        // Fall back to fresh initial state
        state = createInitialGameState();
        currentSnapshot = toImmutableGameState(state);

        // Seed the population history at tick=0 so the chart has a starting
        // point visible in the very first month. The bucket [0,30) requires a
        // CAGG window end >= 30, so we refresh immediately after inserting.
        if (snapshotDb) {
            const db = snapshotDb;
            const seedRows = [...state.planets.values()].map((planet) => ({
                tick: 0,
                planet_id: planet.id,
                population: computePopulationTotal(planet),
            }));
            void insertPlanetPopulationHistory(db, seedRows)
                .then(() => refreshContinuousAggregates(db, TICKS_PER_MONTH, 'monthly'))
                .catch((err) => console.error('[worker] Failed to seed initial population history:', err));
        }
    }

    const pendingActions: PendingAction[] = [];
    let processingTick = false; // True during advanceTick + snapshot creation

    function drainActionQueue(): void {
        if (pendingActions.length === 0) {
            return;
        }

        const actions = pendingActions.splice(0);
        for (const action of actions) {
            try {
                switch (action.type) {
                    case 'createAgent':
                    case 'setAutomation':
                    case 'setWorkerAllocationTargets':
                        handleAgentAction(state, action, safePostMessage);
                        break;
                    case 'requestLoan':
                        handleFinancialAction(state, action, safePostMessage);
                        break;
                    case 'setSellOffers':
                    case 'cancelSellOffer':
                    case 'cancelBuyBid':
                    case 'setBuyBids':
                        handleMarketAction(state, action, safePostMessage);
                        break;
                    case 'leaseClaim':
                    case 'quitClaim':
                        handleResourceAction(state, action, safePostMessage);
                        break;
                    case 'buildFacility':
                    case 'expandFacility':
                    case 'setFacilityScale':
                    case 'buildShipConstructionFacility':
                    case 'expandShipConstructionFacility':
                    case 'setShipConstructionTarget':
                    case 'buildShipMaintenanceFacility':
                    case 'expandShipMaintenanceFacility':
                        handleFacilityAction(state, action, safePostMessage);
                        break;
                    case 'postTransportContract':
                        handlePostTransportContract(state, action, safePostMessage);
                        break;
                    case 'acceptTransportContract':
                        handleAcceptTransportContract(state, action, safePostMessage);
                        break;
                    case 'cancelTransportContract':
                        handleCancelTransportContract(state, action, safePostMessage);
                        break;
                    case 'dispatchShip':
                        handleDispatchShip(state, action, safePostMessage);
                        break;
                    case 'dispatchConstructionShip':
                        handleDispatchConstructionShip(state, action, safePostMessage);
                        break;
                    case 'postConstructionContract':
                        handlePostConstructionContract(state, action, safePostMessage);
                        break;
                    case 'acceptConstructionContract':
                        handleAcceptConstructionContract(state, action, safePostMessage);
                        break;
                    case 'cancelConstructionContract':
                        handleCancelConstructionContract(state, action, safePostMessage);
                        break;
                    case 'postShipBuyingOffer':
                        handlePostShipBuyingOffer(state, action, safePostMessage);
                        break;
                    case 'acceptShipBuyingOffer':
                        handleAcceptShipBuyingOffer(state, action, safePostMessage);
                        break;
                    case 'postShipListing':
                        handlePostShipListing(state, action, safePostMessage);
                        break;
                    case 'cancelShipListing':
                        handleCancelShipListing(state, action, safePostMessage);
                        break;
                    case 'acceptShipListing':
                        handleAcceptShipListing(state, action, safePostMessage);
                        break;
                    case 'acquireLicense':
                        handleAcquireLicense(state, action, safePostMessage);
                        break;
                }
            } catch (err) {
                console.error(`[worker] Failed to apply pending action '${action.type}':`, err);
                if ('requestId' in action) {
                    safePostMessage({
                        type: 'agentCreationFailed',
                        requestId: (action as { requestId: string }).requestId,
                        reason: err instanceof Error ? err.message : String(err),
                    });
                }
            }
        }
    }

    const DEBOUNCE_MS = 1000;
    let lastMessagePost = 0;
    let pendingTickMsg: OutboundMessage | null = null;
    let running = true;

    function safePostMessage(msg: OutboundMessage): void {
        try {
            messagePort?.postMessage(msg);
        } catch (err: unknown) {
            // EPIPE / ERR_WORKER_OUT means the channel is closed — nothing to do.
            if (
                err instanceof Error &&
                ('code' in err
                    ? (err as NodeJS.ErrnoException).code === 'EPIPE' ||
                      (err as NodeJS.ErrnoException).code === 'ERR_WORKER_OUT'
                    : false)
            ) {
                running = false;
                return;
            }
            throw err;
        }
    }

    // Forward console output to the main thread so it appears in the server logger.
    const _origLog = console.log.bind(console);
    const _origWarn = console.warn.bind(console);
    const _origError = console.error.bind(console);
    function forwardLog(level: 'log' | 'warn' | 'error', args: unknown[]): void {
        const message = args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : String(a))).join(' ');
        try {
            safePostMessage({ type: 'workerLog', level, message });
        } catch {
            // If posting fails, fall back to original console to avoid silent loss
            _origError('[worker] Failed to forward log:', message);
        }
    }
    console.log = (...args: unknown[]) => forwardLog('log', args);
    console.warn = (...args: unknown[]) => forwardLog('warn', args);
    console.error = (...args: unknown[]) => forwardLog('error', args);

    function tryFlushMessages(now: number) {
        if (pendingTickMsg && now - lastMessagePost >= DEBOUNCE_MS) {
            safePostMessage(pendingTickMsg);
            lastMessagePost = now;
            pendingTickMsg = null;
        }
    }

    function flushAgentMonthlyHistory(gs: GameState, tick: number): Promise<void> {
        const db = snapshotDb;
        if (!db) {
            return Promise.resolve();
        }
        const rows = [...gs.agents.values()].flatMap((agent) => {
            if (agent.automated) {
                return [];
            }
            return Object.entries(agent.assets).map(([planetId, assets]) => {
                const netBalance = assets.deposits - assets.loans;
                const monthlyNetIncome = assets.monthAcc.revenue;

                const totalWorkers = Math.round(assets.monthAcc.totalWorkersTicks / TICKS_PER_MONTH);

                const facilityCount = assets.productionFacilities.length;

                const planet = gs.planets.get(planetId);
                let storageValue = 0;
                for (const entry of Object.values(assets.storageFacility.currentInStorage)) {
                    if (entry?.quantity) {
                        const price = planet?.marketPrices[entry.resource.name] ?? 0;
                        storageValue += entry.quantity * price;
                    }
                }

                return {
                    tick,
                    planet_id: planetId,
                    agent_id: agent.id,
                    net_balance: netBalance,
                    monthly_net_income: monthlyNetIncome,
                    total_workers: totalWorkers,
                    wages: assets.monthAcc.wages,
                    production_value: assets.monthAcc.productionValue,
                    consumption_value: assets.monthAcc.consumptionValue,
                    purchases: assets.monthAcc.purchases,
                    claim_payments: assets.monthAcc.claimPayments,
                    facility_count: facilityCount,
                    storage_value: storageValue,
                };
            });
        });
        if (rows.length === 0) {
            return Promise.resolve();
        }
        return insertAgentMonthlyHistory(db, rows).catch((err) => {
            console.error(`[worker] Failed to save agent monthly history rows at tick ${tick}:`, err);
        });
    }

    function flushPopulationHistory(gs: GameState, tick: number): Promise<void> {
        const db = snapshotDb;
        if (!db) {
            return Promise.resolve();
        }
        const rows = [...gs.planets.values()].map((planet) => ({
            tick,
            planet_id: planet.id,
            population: computePopulationTotal(planet),
        }));
        if (rows.length === 0) {
            return Promise.resolve();
        }
        return insertPlanetPopulationHistory(db, rows).catch((err) => {
            console.error(`[worker] Failed to save population history rows at tick ${tick}:`, err);
        });
    }

    /**
     * Flush accumulated intra-month price stats to the DB at month boundaries,
     * then reset the accumulator for the next month.
     * Falls back to the current spot price when no trades occurred this month.
     */
    function flushProductPrices(gs: GameState, tick: number): Promise<void> {
        const db = snapshotDb;
        if (!db) {
            return Promise.resolve();
        }
        const rows: Array<{
            tick: number;
            planet_id: string;
            product_name: string;
            avgPrice: number;
            minPrice: number;
            maxPrice: number;
        }> = [];
        for (const planet of gs.planets.values()) {
            for (const [productName, spotPrice] of Object.entries(planet.marketPrices)) {
                if (typeof spotPrice !== 'number' || !isFinite(spotPrice) || spotPrice <= 0) {
                    continue;
                }
                const acc = planet.monthPriceAcc[productName];
                const avgPrice = acc ? acc.sum / acc.count : spotPrice;
                const minPrice = acc ? acc.min : spotPrice;
                const maxPrice = acc ? acc.max : spotPrice;
                // Persist the completed month at its boundary tick (30, 60, …),
                // which is the last tick of that month in the game's 1-based tick domain.
                // This keeps downstream month buckets decodable as valid game ticks.
                const bucketTick = tick;
                rows.push({
                    tick: bucketTick,
                    planet_id: planet.id,
                    product_name: productName,
                    avgPrice,
                    minPrice,
                    maxPrice,
                });
            }
        }
        if (rows.length === 0) {
            return Promise.resolve();
        }
        return insertProductPriceHistory(db, rows).catch((err) => {
            console.error(`[worker] Failed to save product price rows at tick ${tick}:`, err);
        });
    }

    // -----------------------------------------------------------------
    // Cold snapshot persistence (async, non-blocking)
    // -----------------------------------------------------------------

    let snapshotInFlight = false;

    /**
     * Persist the current snapshot to PostgreSQL asynchronously.
     * Runs compression + DB insert without blocking the tick loop.
     * Only one snapshot operation is allowed in flight at a time to
     * prevent accumulation if writes are slower than the interval.
     */
    function spawnSnapshotTask(snapshot: GameStateRecord, tick: number): void {
        if (snapshotInFlight) {
            console.warn(`[worker] Skipping snapshot at tick ${tick} — previous write still in flight`);
            return;
        }

        snapshotInFlight = true;
        const gs = fromImmutableGameState(snapshot);

        void (async () => {
            const db = await getSnapshotDb();
            if (!db) {
                snapshotInFlight = false;
                return;
            }
            const start = Date.now();
            try {
                const snapshotData = serializeGameState(gs);

                await insertGameSnapshot(db, {
                    tick,
                    game_id: 1,
                    snapshot_data: snapshotData,
                });

                if (SNAPSHOT_MAX_RETAINED > 0) {
                    const pruned = await pruneGameSnapshots(db, SNAPSHOT_MAX_RETAINED);
                    if (pruned > 0) {
                        console.log(`[worker] Pruned ${pruned} old snapshot(s)`);
                    }
                }

                const elapsed = Date.now() - start;
                const sizeKb = (snapshotData.length / 1024).toFixed(1);
                console.log(`[worker] Cold snapshot at tick ${tick} saved (${sizeKb} KB, ${elapsed}ms)`);
            } catch (err) {
                console.error(`[worker] Failed to save cold snapshot at tick ${tick}:`, err);
            } finally {
                snapshotInFlight = false;
            }
        })();
    }

    function scheduleTick(): void {
        setTimeout(() => {
            if (!running) {
                return;
            }

            // Start tick processing - prevent eager draining during tick
            processingTick = true;

            const start = Date.now();
            state.tick += 1;

            drainActionQueue();

            try {
                advanceTick(state);
            } catch (err) {
                console.error('[worker] Error while advancing:', err);
            }

            currentSnapshot = toImmutableGameState(state);

            if (state.tick % 30 === 0) {
                const tickAtFlush = state.tick;
                // Chain the CAGG refresh after the insert so it never races against uncommitted data.
                // TimescaleDB only materializes buckets that are FULLY contained in [start, end).
                // The monthly bucket at tick T spans [T, T+TICKS_PER_MONTH), so the end of the
                // window must be >= T + TICKS_PER_MONTH to include it.
                void Promise.all([
                    flushProductPrices(state, tickAtFlush),
                    flushPopulationHistory(state, tickAtFlush),
                    flushAgentMonthlyHistory(state, tickAtFlush),
                ])
                    .then(() => {
                        if (snapshotDb) {
                            return refreshContinuousAggregates(snapshotDb, tickAtFlush + TICKS_PER_MONTH, 'monthly');
                        }
                    })
                    .catch((err) =>
                        console.error(`[worker] Failed to flush/refresh monthly CAGGs at tick ${tickAtFlush}:`, err),
                    );
            }

            if (state.tick % 360 === 0 && snapshotDb) {
                void refreshContinuousAggregates(snapshotDb, state.tick + TICKS_PER_YEAR, 'yearly').catch((err) =>
                    console.error(`[worker] Failed to refresh yearly CAGGs at tick ${state.tick}:`, err),
                );
            }
            if (state.tick % 3600 === 0 && snapshotDb) {
                void refreshContinuousAggregates(snapshotDb, state.tick + TICKS_PER_YEAR * 10, 'decade').catch((err) =>
                    console.error(`[worker] Failed to refresh decade CAGGs at tick ${state.tick}:`, err),
                );
            }

            if (state.tick % SNAPSHOT_INTERVAL_TICKS === 1) {
                spawnSnapshotTask(currentSnapshot, state.tick);
            }

            const elapsedMs = Date.now() - start;
            if (state.tick % 17 === 0) {
                console.log(`[worker] Tick ${state.tick} completed in ${elapsedMs}ms`);
            }

            pendingTickMsg = { type: 'tick', tick: state.tick, elapsedMs };
            tryFlushMessages(Date.now());

            scheduleTick();
        }, TICK_INTERVAL_MS);
    }

    // -----------------------------------------------------------------
    // Query handler — reads from the current immutable snapshot
    // -----------------------------------------------------------------

    function handleQuery(msg: WorkerQueryMessage): void {
        const { requestId } = msg;
        try {
            const snap = currentSnapshot;
            let data: unknown;

            switch (msg.type) {
                case 'getCurrentTick': {
                    data = { tick: snap.tick };
                    break;
                }
                case 'getFullState': {
                    const planets = snap.planets
                        .valueSeq()
                        .map((pr) => pr.data)
                        .toArray();
                    const agents = snap.agents
                        .valueSeq()
                        .map((ar) => ar.data)
                        .toArray();
                    data = { tick: snap.tick, planets, agents };
                    break;
                }
                case 'getPlanet': {
                    const pr = snap.planets.get(msg.planetId);
                    data = { planet: pr ? pr.data : null };
                    break;
                }
                case 'getAllPlanets': {
                    const planets = snap.planets
                        .valueSeq()
                        .map((pr) => pr.data)
                        .toArray();
                    data = { tick: snap.tick, planets };
                    break;
                }
                case 'getAgent': {
                    const ar = snap.agents.get(msg.agentId);
                    data = { agent: ar ? ar.data : null };
                    break;
                }
                case 'getAllAgents': {
                    const agents = snap.agents
                        .valueSeq()
                        .map((ar) => ar.data)
                        .toArray();
                    data = { tick: snap.tick, agents };
                    break;
                }
                case 'getAgentsByPlanet': {
                    const agents = snap.agents
                        .valueSeq()
                        .filter((ar) => ar.data.associatedPlanetId === msg.planetId)
                        .map((ar) => ar.data)
                        .toArray();
                    data = { agents };
                    break;
                }
                case 'getLoanConditions': {
                    const agentRecord = snap.agents.get(msg.agentId);
                    const planetRecord = snap.planets.get(msg.planetId);
                    if (!agentRecord || !planetRecord) {
                        data = { conditions: null };
                    } else {
                        data = { conditions: computeLoanConditions(agentRecord.data, planetRecord.data, snap.tick) };
                    }
                    break;
                }
                case 'getShipCapitalMarket': {
                    data = { shipCapitalMarket: snap.shipCapitalMarket };
                    break;
                }
                default: {
                    const _exhaustive: never = msg;
                    throw new Error(`Unknown query type: ${(_exhaustive as { type: string }).type}`);
                }
            }

            const response: OutboundMessage = {
                type: 'queryResponse',
                requestId,
                queryType: msg.type,
                data,
            } as OutboundMessage;
            safePostMessage(response);
        } catch (err) {
            const errorResponse: OutboundMessage = {
                type: 'queryError',
                requestId,
                error: err instanceof Error ? err.message : String(err),
            };
            safePostMessage(errorResponse);
        }
    }

    // -----------------------------------------------------------------
    // Message handler
    // -----------------------------------------------------------------

    messagePort?.on('message', async (msg: InboundMessage) => {
        if (msg.type === 'ping') {
            const reply: OutboundMessage = { type: 'pong', tick: state.tick };
            safePostMessage(reply);
            return;
        }

        if (msg.type === 'shutdown') {
            running = false;
            console.log('[worker] Received shutdown request — cleaning up resources');

            // Clean up database connection
            if (snapshotDb) {
                try {
                    await snapshotDb.destroy();
                    console.log('[worker] Database connection closed');
                } catch (err) {
                    console.error('[worker] Error closing database connection:', err);
                }
            }

            // Remove event listeners
            process.removeAllListeners('uncaughtException');
            if (messagePort) {
                messagePort.removeAllListeners('message');
            }

            console.log('[worker] Exiting gracefully');
            try {
                setTimeout(() => process.exit(0), 50);
            } catch (_e) {
                process.exit(0);
            }
            return;
        }

        if (msg.type === 'createAgent') {
            const { requestId, agentId, agentName, planetId } = msg;
            // Validate eagerly so clients get immediate feedback on bad input.
            if (state.agents.has(agentId)) {
                safePostMessage({ type: 'agentCreationFailed', requestId, reason: 'Agent ID already exists' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'agentCreationFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            if (agentName.trim().length === 0) {
                safePostMessage({
                    type: 'agentCreationFailed',
                    requestId,
                    reason: 'Agent name cannot be empty',
                });
                return;
            }
            let nameConflict = false;
            state.agents.forEach((a) => {
                if (a.name === agentName) {
                    nameConflict = true;
                }
            });
            if (nameConflict) {
                safePostMessage({
                    type: 'agentCreationFailed',
                    requestId,
                    reason: `Agent name '${agentName}' already exists`,
                });
                return;
            }
            // Enqueue the validated action
            pendingActions.push({ type: 'createAgent', requestId, agentId, agentName, planetId });
            // Eager draining if not currently processing a tick
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'requestLoan') {
            const { requestId, agentId, planetId, amount } = msg;
            // Validate eagerly
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'loanDenied', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({ type: 'loanDenied', requestId, reason: `Planet '${planetId}' not found` });
                return;
            }
            if (typeof amount !== 'number' || amount <= 0) {
                safePostMessage({ type: 'loanDenied', requestId, reason: 'Loan amount must be a positive number' });
                return;
            }
            pendingActions.push({ type: 'requestLoan', requestId, agentId, planetId, amount });
            // Eager draining if not currently processing a tick
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'setAutomation') {
            const { requestId, agentId, automateWorkerAllocation } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'automationFailed', requestId, reason: 'Agent not found' });
                return;
            }
            pendingActions.push({
                type: 'setAutomation',
                requestId,
                agentId,
                automateWorkerAllocation,
            });
            // Eager draining if not currently processing a tick
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'setWorkerAllocationTargets') {
            const { requestId, agentId, planetId, targets } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'workerAllocationFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'workerAllocationFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({ type: 'setWorkerAllocationTargets', requestId, agentId, planetId, targets });
            // Eager draining if not currently processing a tick
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'setSellOffers') {
            const { requestId, agentId, planetId, offers } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'sellOffersFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({ type: 'sellOffersFailed', requestId, reason: `Planet '${planetId}' not found` });
                return;
            }
            pendingActions.push({ type: 'setSellOffers', requestId, agentId, planetId, offers });
            // Eager draining if not currently processing a tick
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'cancelSellOffer') {
            const { requestId, agentId, planetId, resourceName } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'sellOfferCancelFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'sellOfferCancelFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({ type: 'cancelSellOffer', requestId, agentId, planetId, resourceName });
            // Eager draining if not currently processing a tick
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'cancelBuyBid') {
            const { requestId, agentId, planetId, resourceName } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'buyBidCancelFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'buyBidCancelFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({ type: 'cancelBuyBid', requestId, agentId, planetId, resourceName });
            // Eager draining if not currently processing a tick
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'setBuyBids') {
            const { requestId, agentId, planetId, bids } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'buyBidsFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({ type: 'buyBidsFailed', requestId, reason: `Planet '${planetId}' not found` });
                return;
            }
            pendingActions.push({ type: 'setBuyBids', requestId, agentId, planetId, bids });
            // Eager draining if not currently processing a tick
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'leaseClaim') {
            const { requestId, agentId, planetId, resourceName, quantity } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'claimLeaseFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({ type: 'claimLeaseFailed', requestId, reason: `Planet '${planetId}' not found` });
                return;
            }
            pendingActions.push({ type: 'leaseClaim', requestId, agentId, planetId, resourceName, quantity });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'quitClaim') {
            const { requestId, agentId, planetId, claimId } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'claimQuitFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({ type: 'claimQuitFailed', requestId, reason: `Planet '${planetId}' not found` });
                return;
            }
            pendingActions.push({ type: 'quitClaim', requestId, agentId, planetId, claimId });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'buildShipConstructionFacility') {
            const { requestId, agentId, planetId, facilityName, targetScale } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'shipConstructionFacilityBuildFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'shipConstructionFacilityBuildFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({
                type: 'buildShipConstructionFacility',
                requestId,
                agentId,
                planetId,
                facilityName,
                targetScale,
            });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'expandShipConstructionFacility') {
            const { requestId, agentId, planetId, facilityId, targetScale } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'shipConstructionFacilityExpandFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'shipConstructionFacilityExpandFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({
                type: 'expandShipConstructionFacility',
                requestId,
                agentId,
                planetId,
                facilityId,
                targetScale,
            });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'setShipConstructionTarget') {
            const { requestId, agentId, planetId, facilityId, shipTypeName, shipName } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'shipConstructionTargetSetFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'shipConstructionTargetSetFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({
                type: 'setShipConstructionTarget',
                requestId,
                agentId,
                planetId,
                facilityId,
                shipTypeName,
                shipName,
            });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'buildShipMaintenanceFacility') {
            const { requestId, agentId, planetId, facilityName, targetScale } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'shipMaintenanceFacilityBuildFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'shipMaintenanceFacilityBuildFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({
                type: 'buildShipMaintenanceFacility',
                requestId,
                agentId,
                planetId,
                facilityName,
                targetScale,
            });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'expandShipMaintenanceFacility') {
            const { requestId, agentId, planetId, facilityId, targetScale } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'shipMaintenanceFacilityExpandFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'shipMaintenanceFacilityExpandFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({
                type: 'expandShipMaintenanceFacility',
                requestId,
                agentId,
                planetId,
                facilityId,
                targetScale,
            });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'buildFacility') {
            const { requestId, agentId, planetId, facilityKey, targetScale } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'facilityBuildFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({ type: 'facilityBuildFailed', requestId, reason: `Planet '${planetId}' not found` });
                return;
            }
            pendingActions.push({ type: 'buildFacility', requestId, agentId, planetId, facilityKey, targetScale });
            // Eager draining if not currently processing a tick
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'expandFacility') {
            const { requestId, agentId, planetId, facilityId, targetScale } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'facilityExpandFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({ type: 'facilityExpandFailed', requestId, reason: `Planet '${planetId}' not found` });
                return;
            }
            pendingActions.push({ type: 'expandFacility', requestId, agentId, planetId, facilityId, targetScale });
            // Eager draining if not currently processing a tick
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'setFacilityScale') {
            const { requestId, agentId, planetId, facilityId, scaleFraction } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'facilityScaleSetFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'facilityScaleSetFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({ type: 'setFacilityScale', requestId, agentId, planetId, facilityId, scaleFraction });
            // Eager draining if not currently processing a tick
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'postTransportContract') {
            const {
                requestId,
                agentId,
                planetId,
                toPlanetId,
                cargo,
                maxDurationInTicks,
                offeredReward,
                expiresAtTick,
            } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'transportContractPostFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'transportContractPostFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({
                type: 'postTransportContract',
                requestId,
                agentId,
                planetId,
                toPlanetId,
                cargo,
                maxDurationInTicks,
                offeredReward,
                expiresAtTick,
            });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'acceptTransportContract') {
            const { requestId, agentId, planetId, posterAgentId, contractId, shipName } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'transportContractAcceptFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'transportContractAcceptFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({
                type: 'acceptTransportContract',
                requestId,
                agentId,
                planetId,
                posterAgentId,
                contractId,
                shipName,
            });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'cancelTransportContract') {
            const { requestId, agentId, planetId, contractId } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'transportContractCancelFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'transportContractCancelFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({ type: 'cancelTransportContract', requestId, agentId, planetId, contractId });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'dispatchShip') {
            const { requestId, agentId, fromPlanetId, toPlanetId, shipName, cargoGoal } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'shipDispatchFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(toPlanetId)) {
                safePostMessage({ type: 'shipDispatchFailed', requestId, reason: `Planet '${toPlanetId}' not found` });
                return;
            }
            pendingActions.push({
                type: 'dispatchShip',
                requestId,
                agentId,
                fromPlanetId,
                toPlanetId,
                shipName,
                cargoGoal,
            });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'dispatchConstructionShip') {
            const { requestId, agentId, fromPlanetId, toPlanetId, shipName, facilityName } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'constructionShipDispatchFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(toPlanetId)) {
                safePostMessage({
                    type: 'constructionShipDispatchFailed',
                    requestId,
                    reason: `Planet '${toPlanetId}' not found`,
                });
                return;
            }
            pendingActions.push({
                type: 'dispatchConstructionShip',
                requestId,
                agentId,
                fromPlanetId,
                toPlanetId,
                shipName,
                facilityName,
            });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'postConstructionContract') {
            const {
                requestId,
                agentId,
                planetId,
                toPlanetId,
                facilityName,
                commissioningAgentId,
                offeredReward,
                expiresAtTick,
            } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'constructionContractPostFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'constructionContractPostFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({
                type: 'postConstructionContract',
                requestId,
                agentId,
                planetId,
                toPlanetId,
                facilityName,
                commissioningAgentId,
                offeredReward,
                expiresAtTick,
            });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'acceptConstructionContract') {
            const { requestId, agentId, planetId, posterAgentId, contractId, shipName } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'constructionContractAcceptFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'constructionContractAcceptFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({
                type: 'acceptConstructionContract',
                requestId,
                agentId,
                planetId,
                posterAgentId,
                contractId,
                shipName,
            });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'cancelConstructionContract') {
            const { requestId, agentId, planetId, contractId } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'constructionContractCancelFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'constructionContractCancelFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({ type: 'cancelConstructionContract', requestId, agentId, planetId, contractId });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'postShipBuyingOffer') {
            const { requestId, agentId, planetId, shipType, price } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'shipBuyingOfferPostFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'shipBuyingOfferPostFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({ type: 'postShipBuyingOffer', requestId, agentId, planetId, shipType, price });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'acceptShipBuyingOffer') {
            const { requestId, agentId, planetId, posterAgentId, offerId, shipName } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'shipBuyingOfferAcceptFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'shipBuyingOfferAcceptFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({
                type: 'acceptShipBuyingOffer',
                requestId,
                agentId,
                planetId,
                posterAgentId,
                offerId,
                shipName,
            });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'postShipListing') {
            const { requestId, agentId, planetId, shipName, askPrice } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'shipListingPostFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({ type: 'shipListingPostFailed', requestId, reason: `Planet '${planetId}' not found` });
                return;
            }
            pendingActions.push({ type: 'postShipListing', requestId, agentId, planetId, shipName, askPrice });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'cancelShipListing') {
            const { requestId, agentId, planetId, listingId } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'shipListingCancelFailed', requestId, reason: 'Agent not found' });
                return;
            }
            pendingActions.push({ type: 'cancelShipListing', requestId, agentId, planetId, listingId });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'acceptShipListing') {
            const { requestId, buyerAgentId, buyerPlanetId, sellerAgentId, listingId } = msg;
            if (!state.agents.has(buyerAgentId)) {
                safePostMessage({ type: 'shipListingAcceptFailed', requestId, reason: 'Buyer agent not found' });
                return;
            }
            if (!state.agents.has(sellerAgentId)) {
                safePostMessage({ type: 'shipListingAcceptFailed', requestId, reason: 'Seller agent not found' });
                return;
            }
            pendingActions.push({
                type: 'acceptShipListing',
                requestId,
                buyerAgentId,
                buyerPlanetId,
                sellerAgentId,
                listingId,
            });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'acquireLicense') {
            const { requestId, agentId, planetId, licenseType } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'licenseAcquisitionFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'licenseAcquisitionFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({ type: 'acquireLicense', requestId, agentId, planetId, licenseType });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        // All remaining message types are query messages with a requestId.
        if ('requestId' in msg) {
            handleQuery(msg as WorkerQueryMessage);
            return;
        }
    });

    // -----------------------------------------------------------------
    // Start the simulation loop and return a never-resolving promise
    // so Piscina keeps this thread occupied.
    // -----------------------------------------------------------------

    // Catch stray EPIPE errors that can surface during shutdown when the
    // communication channel between worker and main thread is torn down.
    process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') {
            running = false;
            return;
        }
        // Re-throw anything else so it surfaces normally.
        throw err;
    });

    console.log(`[worker] Simulation worker started (tick interval: ${TICK_INTERVAL_MS}ms)`);
    scheduleTick();

    // The promise resolves only when `running` is set to false (shutdown).
    // In normal operation this keeps the Piscina thread busy indefinitely.
    return new Promise<void>(() => {
        // intentionally never resolved — Piscina will terminate the thread
        // via pool.destroy() when the manager shuts down.
    });
}
