import { parentPort, workerData, type MessagePort } from 'node:worker_threads';
import knexConfig from '../../knexfile.js';
import { advanceTick, seedRng } from './engine';
import { computeLoanConditions } from './financial/loanConditions';
import { totalOutstandingLoans } from './financial/loanTypes';
import { computeFacilitiesValue, computeShipsValue } from './financial/assetValuation';
import { constructionServiceResourceType } from './planet/services';
import {
    getLatestGameSnapshot,
    insertAgentMonthlyHistory,
    insertGameSnapshot,
    insertPlanetEconomyHistory,
    insertPlanetPopulationHistory,
    insertProductPriceHistory,
    pruneGameSnapshots,
    refreshContinuousAggregates,
} from './gameSnapshotRepository';
import { computeCostOfLiving } from './market/serviceDefinitions';
import type { GameState } from './planet/planet';

import { TICKS_PER_MONTH, TICKS_PER_YEAR } from './constants';
import { createInitialGameState } from './initialUniverse';
import type { WorkerQueryMessage } from './queries';
import { deserializeSnapshot, gameStateToWire, serializeGameState } from './snapshotCompression';
import { SNAPSHOT_INTERVAL_TICKS, SNAPSHOT_MAX_RETAINED } from './snapshotConfig';
import { computePopulationTotal } from './snapshotRepository';
import { handleAgentAction } from './workerClient/agentActions';
import { handleFacilityAction } from './workerClient/facilityActions';
import { handleFinancialAction } from './workerClient/financialActions';
import { handleAcquireLicense } from './workerClient/licenseActions';
import { handleMarketAction } from './workerClient/marketActions';
import type { InboundMessage, OutboundMessage, PendingAction } from './workerClient/messages';
import { handleResourceAction } from './workerClient/resourceActions';
import {
    handleAcceptConstructionContract,
    handleAcceptShipBuyingOffer,
    handleAcceptShipListing,
    handleAcceptTransportContract,
    handleCancelConstructionContract,
    handleCancelShipListing,
    handleCancelTransportContract,
    handleDispatchConstructionShip,
    handleDispatchPassengerShip,
    handleDispatchShip,
    handlePostConstructionContract,
    handlePostShipBuyingOffer,
    handlePostShipListing,
    handlePostTransportContract,
} from './workerClient/shipContractActions';
export type { InboundMessage, OutboundMessage, PendingAction } from './workerClient/messages';

interface TaskPayload {
    command: string;
    port?: MessagePort;
}

export default async function simulationTask(task: TaskPayload): Promise<void> {
    const messagePort = task.port ?? parentPort;

    let snapshotDb: import('knex').Knex | null = null;

    async function getSnapshotDb(): Promise<import('knex').Knex | null> {
        if (snapshotDb) {
            return snapshotDb;
        }
        try {
            const { default: knexModule } = await import('knex');
            const isDevelopment = process.env.NODE_ENV === 'development';
            const dbConfig = isDevelopment ? knexConfig.development : knexConfig.production;

            if (!dbConfig) {
                console.warn('[worker] No knex config found — snapshot persistence disabled');
                return null;
            }

            snapshotDb = knexModule({
                ...dbConfig,
                pool: { min: 1, max: 2 },
            });
            return snapshotDb;
        } catch (err) {
            console.warn('[worker] Failed to create snapshot DB pool:', err);
            return null;
        }
    }

    const TICK_INTERVAL_MS: number = typeof workerData?.tickIntervalMs === 'number' ? workerData.tickIntervalMs : 0;

    seedRng(42);

    let state: GameState;
    let recovered = false;

    try {
        const db = await getSnapshotDb();
        if (db) {
            const latestRow = await getLatestGameSnapshot(db);
            if (latestRow) {
                state = deserializeSnapshot(latestRow.snapshot_data);
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
        state = createInitialGameState();

        if (snapshotDb) {
            const db = snapshotDb;
            const seedRows = [...state.planets.values()].map((planet) => ({
                tick: 0,
                planet_id: planet.id,
                population: computePopulationTotal(planet),
                grocery_buffer: 0,
                healthcare_buffer: 0,
                logistics_buffer: 0,
                education_buffer: 0,
                retail_buffer: 0,
                construction_buffer: 0,
                maintenance_buffer: 0,
                administration_buffer: 0,
            }));
            void insertPlanetPopulationHistory(db, seedRows)
                .then(() => refreshContinuousAggregates(db, TICKS_PER_MONTH, 'monthly'))
                .catch((err) => console.error('[worker] Failed to seed initial population history:', err));
        }
    }

    const pendingActions: PendingAction[] = [];
    let processingTick = false;

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
                    case 'repayLoan':
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
                    case 'cancelConstruction':
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
                    case 'dispatchPassengerShip':
                        handleDispatchPassengerShip(state, action, safePostMessage);
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

    const DEBOUNCE_MS = 50;
    let lastMessagePost = 0;
    let pendingTickMsg: OutboundMessage | null = null;
    let running = true;

    function safePostMessage(msg: OutboundMessage): void {
        try {
            messagePort?.postMessage(msg);
        } catch (err: unknown) {
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

    const _origLog = console.log.bind(console);
    const _origWarn = console.warn.bind(console);
    const _origError = console.error.bind(console);
    function forwardLog(level: 'log' | 'warn' | 'error', args: unknown[]): void {
        const message = args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : String(a))).join(' ');
        try {
            safePostMessage({ type: 'workerLog', level, message });
        } catch {
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
                const cashBalance = assets.deposits - totalOutstandingLoans(assets.activeLoans);

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

                // Compute net-worth including real assets (facilities + ships)
                const csPrice = planet?.marketPrices[constructionServiceResourceType.name] ?? 0;
                const facilitiesValue = computeFacilitiesValue(assets, csPrice);
                const shipsValue = computeShipsValue(agent, gs.shipCapitalMarket, planet?.marketPrices ?? {});
                const netWorth = cashBalance + facilitiesValue + shipsValue;

                return {
                    tick,
                    planet_id: planetId,
                    agent_id: agent.id,
                    net_balance: netWorth,
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

    function computeAvgServiceBuffer(
        planet: import('./planet/planet').Planet,
        serviceName: import('./population/population').ServiceName,
    ): number {
        let sum = 0;
        let totalPop = 0;
        for (const cohort of planet.population.demography) {
            for (const occ of ['education', 'employed', 'unoccupied', 'unableToWork'] as const) {
                for (const edu of ['none', 'primary', 'secondary', 'tertiary'] as const) {
                    for (const skill of ['novice', 'professional', 'expert'] as const) {
                        const cat = cohort[occ][edu][skill];
                        if (cat.total > 0) {
                            sum += cat.services[serviceName].buffer * cat.total;
                            totalPop += cat.total;
                        }
                    }
                }
            }
        }
        return totalPop > 0 ? sum / totalPop : 0;
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
            grocery_buffer: computeAvgServiceBuffer(planet, 'grocery'),
            healthcare_buffer: computeAvgServiceBuffer(planet, 'healthcare'),
            logistics_buffer: computeAvgServiceBuffer(planet, 'logistics'),
            education_buffer: computeAvgServiceBuffer(planet, 'education'),
            retail_buffer: computeAvgServiceBuffer(planet, 'retail'),
            construction_buffer: computeAvgServiceBuffer(planet, 'construction'),
            maintenance_buffer: computeAvgServiceBuffer(planet, 'maintenance'),
            administration_buffer: computeAvgServiceBuffer(planet, 'administration'),
        }));
        if (rows.length === 0) {
            return Promise.resolve();
        }
        return insertPlanetPopulationHistory(db, rows).catch((err) => {
            console.error(`[worker] Failed to save population history rows at tick ${tick}:`, err);
        });
    }

    function flushPlanetEconomyHistory(gs: GameState, tick: number): Promise<void> {
        const db = snapshotDb;
        if (!db) {
            return Promise.resolve();
        }
        const rows = [...gs.planets.values()].map((planet) => {
            const bank = planet.bank;

            const gdp =
                Object.values(planet.avgMarketResult).reduce((sum, r) => sum + r.clearingPrice * r.totalVolume, 0) *
                TICKS_PER_YEAR;

            const costOfLiving = computeCostOfLiving(planet, false);
            const costOfLivingRich = computeCostOfLiving(planet, true);
            const wageEdu0 = planet.wagePerEdu.none ?? 0;
            const wageEdu1 = planet.wagePerEdu.primary ?? 0;
            const wageEdu2 = planet.wagePerEdu.secondary ?? 0;
            const wageEdu3 = planet.wagePerEdu.tertiary ?? 0;

            const policyRate = bank.loanRate;
            const bankEquity = bank.equity;
            const moneySupply = bank.deposits;

            return {
                tick,
                planet_id: planet.id,
                gdp,
                cost_of_living: costOfLiving,
                cost_of_living_rich: costOfLivingRich,
                wage_edu0: wageEdu0,
                wage_edu1: wageEdu1,
                wage_edu2: wageEdu2,
                wage_edu3: wageEdu3,
                policy_rate: policyRate,
                bank_equity: bankEquity,
                money_supply: moneySupply,
            };
        });
        if (rows.length === 0) {
            return Promise.resolve();
        }
        return insertPlanetEconomyHistory(db, rows).catch((err) => {
            console.error(`[worker] Failed to save planet economy history rows at tick ${tick}:`, err);
        });
    }

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

    let snapshotInFlight = false;

    function spawnSnapshotTask(snapshot: GameState, tick: number): void {
        if (snapshotInFlight) {
            console.warn(`[worker] Skipping snapshot at tick ${tick} — previous write still in flight`);
            return;
        }

        snapshotInFlight = true;

        void (async () => {
            const db = await getSnapshotDb();
            if (!db) {
                snapshotInFlight = false;
                return;
            }
            const start = Date.now();
            try {
                const snapshotData = serializeGameState(snapshot);

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

    function scheduleTick(interval: number = TICK_INTERVAL_MS): void {
        setTimeout(() => {
            if (!running) {
                return;
            }

            if (processingTick) {
                scheduleTick(0);
                return;
            }

            scheduleTick();

            processingTick = true;

            const start = Date.now();
            state.tick += 1;

            drainActionQueue();

            try {
                advanceTick(state);
            } catch (err) {
                console.error('[worker] Error while advancing:', err);
            }

            // Pre-compute derived values for O(1) controller lookups — one pass per tick
            for (const planet of state.planets.values()) {
                planet._populationTotal = undefined;
                planet._populationTotal = computePopulationTotal(planet);

                planet._gdp =
                    Object.values(planet.avgMarketResult).reduce((sum, r) => sum + r.clearingPrice * r.totalVolume, 0) *
                    TICKS_PER_YEAR;

                planet._costOfLivingRich = undefined;
                planet._costOfLiving = undefined;
                planet._costOfLiving = computeCostOfLiving(planet, false);
                planet._costOfLivingRich = computeCostOfLiving(planet, true);

                planet._freeResources = undefined;
                planet._freeResources = Object.entries(planet.resources)
                    .map(([name, entries]) => ({
                        name,
                        freeCapacity: entries.pool.maximumCapacity,
                    }))
                    .sort((a, b) => b.freeCapacity - a.freeCapacity);
            }

            processingTick = false;

            if (state.tick % 30 === 0) {
                const tickAtFlush = state.tick;

                void Promise.all([
                    flushProductPrices(state, tickAtFlush),
                    flushPopulationHistory(state, tickAtFlush),
                    flushAgentMonthlyHistory(state, tickAtFlush),
                    flushPlanetEconomyHistory(state, tickAtFlush),
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
                spawnSnapshotTask(state, state.tick);
            }

            const elapsedMs = Date.now() - start;
            if (state.tick % 17 === 0) {
                console.log(`[worker] Tick ${state.tick} completed in ${elapsedMs}ms`);
            }

            // Push the game state wire format directly to the main thread via structured clone,
            // bypassing msgpack/gzip entirely — the main thread receives it pre-deserialized.
            pendingTickMsg = {
                type: 'snapshot',
                tick: state.tick,
                data: gameStateToWire(state),
                elapsedMs,
                tickerEvents: state.tickerEvents,
            };
            tryFlushMessages(Date.now());
        }, interval);
    }

    function handleQuery(msg: WorkerQueryMessage): void {
        const { requestId } = msg;
        try {
            const snap = state;
            let data: unknown;

            switch (msg.type) {
                case 'getCurrentTick': {
                    data = { tick: snap.tick };
                    break;
                }
                case 'getFullState': {
                    const planets = [...snap.planets.values()];
                    const agents = [...snap.agents.values()];
                    data = { tick: snap.tick, planets, agents };
                    break;
                }
                case 'getPlanet': {
                    data = { planet: snap.planets.get(msg.planetId) ?? null };
                    break;
                }
                case 'getAllPlanets': {
                    const planets = [...snap.planets.values()];
                    data = { tick: snap.tick, planets };
                    break;
                }
                case 'getAgent': {
                    data = { agent: snap.agents.get(msg.agentId) ?? null };
                    break;
                }
                case 'getAllAgents': {
                    const agents = [...snap.agents.values()];
                    data = { tick: snap.tick, agents };
                    break;
                }
                case 'getLoanConditions': {
                    const agent = snap.agents.get(msg.agentId);
                    const planet = snap.planets.get(msg.planetId);
                    if (!agent || !planet) {
                        data = { conditions: null, activeLoans: [] };
                    } else {
                        data = {
                            conditions: computeLoanConditions(agent, planet, snap.shipCapitalMarket),
                            activeLoans: agent.assets[msg.planetId]?.activeLoans ?? [],
                        };
                    }
                    break;
                }
                case 'getShipCapitalMarket': {
                    data = { shipCapitalMarket: snap.shipCapitalMarket };
                    break;
                }
                case 'getPlanetWithAgents': {
                    const planet = snap.planets.get(msg.planetId);
                    const agents = [...snap.agents.values()].filter((a) => a.assets[msg.planetId] !== undefined);
                    const forexMMs = [...snap.forexMarketMakers.values()].filter(
                        (mm) => mm.assets[msg.planetId] !== undefined,
                    );
                    data = { tick: snap.tick, planet: planet ?? null, agents: [...agents, ...forexMMs] };
                    break;
                }
                case 'getTickerEvents': {
                    data = {
                        tickerEvents: state.tickerEvents,
                    };
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

    messagePort?.on('message', async (msg: InboundMessage) => {
        if (msg.type === 'ping') {
            const reply: OutboundMessage = { type: 'pong', tick: state.tick };
            safePostMessage(reply);
            return;
        }

        if (msg.type === 'shutdown') {
            running = false;
            console.log('[worker] Received shutdown request — cleaning up resources');

            if (snapshotDb) {
                try {
                    await snapshotDb.destroy();
                    console.log('[worker] Database connection closed');
                } catch (err) {
                    console.error('[worker] Error closing database connection:', err);
                }
            }

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

            pendingActions.push({ type: 'createAgent', requestId, agentId, agentName, planetId });

            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'requestLoan') {
            const { requestId, agentId, planetId, amount } = msg;

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

            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'repayLoan') {
            const { requestId, agentId, planetId, loanId, fraction } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'repayDenied', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({ type: 'repayDenied', requestId, reason: `Planet '${planetId}' not found` });
                return;
            }
            if (typeof loanId !== 'string' || loanId.trim() === '') {
                safePostMessage({ type: 'repayDenied', requestId, reason: 'loanId must be a non-empty string' });
                return;
            }
            if (typeof fraction !== 'number' || fraction <= 0 || fraction > 1) {
                safePostMessage({ type: 'repayDenied', requestId, reason: 'fraction must be a number in (0, 1]' });
                return;
            }
            pendingActions.push({ type: 'repayLoan', requestId, agentId, planetId, loanId, fraction });
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
            const { requestId, agentId, planetId, posterAgentId, contractId, shipId } = msg;
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
                shipId,
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
            const { requestId, agentId, fromPlanetId, toPlanetId, shipId, cargoGoal } = msg;
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
                shipId,
                cargoGoal,
            });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'dispatchConstructionShip') {
            const { requestId, agentId, fromPlanetId, toPlanetId, shipId, facilityName } = msg;
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
                shipId,
                facilityName,
            });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'dispatchPassengerShip') {
            const { requestId, agentId, fromPlanetId, toPlanetId, shipId, passengerCount } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'passengerShipDispatchFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(toPlanetId)) {
                safePostMessage({
                    type: 'passengerShipDispatchFailed',
                    requestId,
                    reason: `Planet '${toPlanetId}' not found`,
                });
                return;
            }
            pendingActions.push({
                type: 'dispatchPassengerShip',
                requestId,
                agentId,
                fromPlanetId,
                toPlanetId,
                shipId,
                passengerCount,
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
            const { requestId, agentId, planetId, posterAgentId, contractId, shipId } = msg;
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
                shipId,
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
            const { requestId, agentId, planetId, posterAgentId, offerId, shipId } = msg;
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
                shipId,
            });
            if (!processingTick) {
                drainActionQueue();
            }
            return;
        }

        if (msg.type === 'postShipListing') {
            const { requestId, agentId, planetId, shipId, askPrice } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'shipListingPostFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({ type: 'shipListingPostFailed', requestId, reason: `Planet '${planetId}' not found` });
                return;
            }
            pendingActions.push({ type: 'postShipListing', requestId, agentId, planetId, shipId, askPrice });
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

        if (msg.type === 'cancelConstruction') {
            const { requestId, agentId, planetId, facilityId } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'constructionCancelFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({
                    type: 'constructionCancelFailed',
                    requestId,
                    reason: `Planet '${planetId}' not found`,
                });
                return;
            }
            pendingActions.push({ type: 'cancelConstruction', requestId, agentId, planetId, facilityId });
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

        if ('requestId' in msg) {
            handleQuery(msg as WorkerQueryMessage);
            return;
        }
    });

    process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') {
            running = false;
            return;
        }

        throw err;
    });

    console.log(`[worker] Simulation worker started (tick interval: ${TICK_INTERVAL_MS}ms)`);
    scheduleTick();

    return new Promise<void>(() => {});
}
