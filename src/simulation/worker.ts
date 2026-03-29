import { parentPort, workerData, type MessagePort } from 'node:worker_threads';
import { advanceTick, seedRng } from './engine';
import {
    getLatestGameSnapshot,
    insertGameSnapshot,
    insertPlanetPopulationHistory,
    insertAgentMonthlyHistory,
    pruneGameSnapshots,
    pruneAgentMonthlyHistory,
} from './gameSnapshotRepository';
import { fromImmutableGameState, toImmutableGameState, type GameStateRecord } from './immutableTypes';
import type { Agent, GameState } from './planet/planet';
import type { WorkerQueryMessage } from './queries';
import { deserializeSnapshot, serializeGameState } from './snapshotCompression';
import { SNAPSHOT_INTERVAL_TICKS, SNAPSHOT_MAX_RETAINED } from './snapshotConfig';
import { computeGlobalStarvation, computePopulationTotal } from './snapshotRepository';
import { createInitialGameState } from './utils/initialWorld';
import knexConfig from '../../knexfile.js';
import { computeLoanConditions } from './financial/loanConditions';
import { FOOD_PRICE_FLOOR as PRICE_FLOOR } from './constants';
import { agriculturalProductResourceType } from './planet/resources';
import { arableLandResourceType, waterSourceResourceType } from './planet/landBoundResources';
import { makeAgent } from './utils/testHelper';
import { collapseUntenantedClaims } from './utils/entities';
import { makeAgriculturalProduction, makeStorage, makeWaterExtraction } from './utils/initialWorld';
import { facilityByName } from './planet/facilityCatalog';
import { ALL_RESOURCES } from './planet/resourceCatalog';
export type { InboundMessage, OutboundMessage, PendingAction } from './workerClient/messages';
import type { InboundMessage, OutboundMessage, PendingAction } from './workerClient/messages';

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
    }

    // -----------------------------------------------------------------
    // Action queue — collects user-driven state mutations between ticks
    // -----------------------------------------------------------------

    const pendingActions: PendingAction[] = [];

    /**
     * Apply every queued action to `state` in FIFO order.
     * Called once per tick, right before `advanceTick`, so the snapshot
     * is only updated in the normal post-tick path rather than ad-hoc.
     */
    function drainActionQueue(): void {
        if (pendingActions.length === 0) {
            return;
        }

        const actions = pendingActions.splice(0);
        for (const action of actions) {
            try {
                switch (action.type) {
                    case 'createAgent': {
                        const { requestId, agentId, agentName, planetId } = action;

                        const newAgent: Agent = makeAgent(agentId, planetId, agentName);
                        newAgent.automated = false; // explicitly mark user-created agents as non-automated
                        newAgent.automateWorkerAllocation = false; // start with manual control
                        state.agents.set(agentId, newAgent);
                        console.log(`[worker] Created agent '${agentName}' (${agentId}) on planet '${planetId}'`);
                        safePostMessage({ type: 'agentCreated', requestId, agentId });
                        break;
                    }
                    case 'requestLoan': {
                        const { requestId, agentId, planetId, amount } = action;
                        const agent = state.agents.get(agentId);
                        const planet = state.planets.get(planetId);
                        if (!agent || !planet) {
                            safePostMessage({
                                type: 'loanDenied',
                                requestId,
                                reason: 'Agent or planet not found',
                            });
                            break;
                        }
                        // Re-check credit conditions at application time to guard
                        // against race conditions (e.g. conditions changed between
                        // getLoanConditions query and the actual request).
                        const conditions = computeLoanConditions(agent, planet);
                        if (amount <= 0 || amount > conditions.maxLoanAmount) {
                            safePostMessage({
                                type: 'loanDenied',
                                requestId,
                                reason: `Requested amount ${amount} exceeds approved limit ${conditions.maxLoanAmount}`,
                            });
                            break;
                        }
                        // TODO: unify with automatic loan for wages and move to wealthOps
                        const assets = agent.assets[planetId];
                        assets.deposits += amount;
                        assets.loans += amount;
                        planet.bank.loans += amount;
                        planet.bank.deposits += amount;
                        planet.bank.equity = planet.bank.deposits - planet.bank.loans;
                        console.log(`[worker] Loan of ${amount} granted to agent '${agentId}' on planet '${planetId}'`);
                        safePostMessage({ type: 'loanGranted', requestId, agentId, amount });
                        break;
                    }
                    case 'setAutomation': {
                        const { requestId, agentId, automateWorkerAllocation } = action;
                        const agent = state.agents.get(agentId);
                        if (!agent) {
                            safePostMessage({ type: 'automationFailed', requestId, reason: 'Agent not found' });
                            break;
                        }
                        agent.automateWorkerAllocation = automateWorkerAllocation;
                        console.log(
                            `[worker] Automation updated for agent '${agentId}': ` +
                                `workerAllocation=${automateWorkerAllocation}`,
                        );
                        safePostMessage({ type: 'automationSet', requestId, agentId });
                        break;
                    }
                    case 'setWorkerAllocationTargets': {
                        const { requestId, agentId, planetId, targets } = action;
                        const agent = state.agents.get(agentId);
                        if (!agent) {
                            safePostMessage({ type: 'workerAllocationFailed', requestId, reason: 'Agent not found' });
                            break;
                        }
                        const assets = agent.assets[planetId];
                        if (!assets) {
                            safePostMessage({
                                type: 'workerAllocationFailed',
                                requestId,
                                reason: `Agent has no assets on planet '${planetId}'`,
                            });
                            break;
                        }
                        // Merge provided targets into allocatedWorkers (missing levels stay unchanged)
                        for (const [edu, count] of Object.entries(targets)) {
                            if (typeof count === 'number' && count >= 0) {
                                (assets.allocatedWorkers as Record<string, number>)[edu] = count;
                            }
                        }
                        console.log(
                            `[worker] Worker allocation targets updated for agent '${agentId}' on '${planetId}'`,
                        );
                        safePostMessage({ type: 'workerAllocationSet', requestId, agentId });
                        break;
                    }
                    case 'setSellOffers': {
                        const { requestId, agentId, planetId, offers } = action;
                        const agent = state.agents.get(agentId);
                        if (!agent) {
                            safePostMessage({ type: 'sellOffersFailed', requestId, reason: 'Agent not found' });
                            break;
                        }
                        const assets = agent.assets[planetId];
                        if (!assets) {
                            safePostMessage({
                                type: 'sellOffersFailed',
                                requestId,
                                reason: `Agent has no assets on planet '${planetId}'`,
                            });
                            break;
                        }
                        if (!assets.market) {
                            assets.market = { sell: {}, buy: {} };
                        }
                        for (const [resourceName, update] of Object.entries(offers)) {
                            if (!assets.market.sell[resourceName]) {
                                let resource = null;
                                outerLoop: for (const facility of assets.productionFacilities) {
                                    for (const p of facility.produces) {
                                        if (p.resource.name === resourceName) {
                                            resource = p.resource;
                                            break outerLoop;
                                        }
                                    }
                                }
                                if (!resource) {
                                    resource = assets.storageFacility.currentInStorage[resourceName]?.resource ?? null;
                                }
                                if (!resource) {
                                    continue;
                                }
                                assets.market.sell[resourceName] = { resource };
                            }
                            const offer = assets.market.sell[resourceName];
                            if (update.offerPrice !== undefined && update.offerPrice > 0) {
                                offer.offerPrice = Math.max(PRICE_FLOOR, update.offerPrice);
                            }
                            if (update.offerQuantity !== undefined && update.offerQuantity >= 0) {
                                offer.offerQuantity = update.offerQuantity;
                            }
                            if (update.offerRetainment !== undefined && update.offerRetainment >= 0) {
                                offer.offerRetainment = update.offerRetainment;
                            }
                            if (update.automated !== undefined) {
                                offer.automated = update.automated;
                            }
                        }
                        console.log(`[worker] Sell offers updated for agent '${agentId}' on '${planetId}'`);
                        safePostMessage({ type: 'sellOffersSet', requestId, agentId });
                        break;
                    }
                    case 'cancelSellOffer': {
                        const { requestId, agentId, planetId, resourceName } = action;
                        const agent = state.agents.get(agentId);
                        if (!agent) {
                            safePostMessage({ type: 'sellOfferCancelFailed', requestId, reason: 'Agent not found' });
                            break;
                        }
                        const assets = agent.assets[planetId];
                        if (!assets) {
                            safePostMessage({
                                type: 'sellOfferCancelFailed',
                                requestId,
                                reason: `Agent has no assets on planet '${planetId}'`,
                            });
                            break;
                        }
                        if (assets.market?.sell) {
                            delete assets.market.sell[resourceName];
                        }
                        console.log(
                            `[worker] Sell offer cancelled for agent '${agentId}' on '${planetId}' resource '${resourceName}'`,
                        );
                        safePostMessage({ type: 'sellOfferCancelled', requestId, agentId });
                        break;
                    }
                    case 'cancelBuyBid': {
                        const { requestId, agentId, planetId, resourceName } = action;
                        const agent = state.agents.get(agentId);
                        if (!agent) {
                            safePostMessage({ type: 'buyBidCancelFailed', requestId, reason: 'Agent not found' });
                            break;
                        }
                        const assets = agent.assets[planetId];
                        if (!assets) {
                            safePostMessage({
                                type: 'buyBidCancelFailed',
                                requestId,
                                reason: `Agent has no assets on planet '${planetId}'`,
                            });
                            break;
                        }
                        const bid = assets.market?.buy[resourceName];
                        if (bid) {
                            delete bid.bidPrice;
                            delete bid.bidQuantity;
                            delete bid.bidStorageTarget;
                            delete bid.automated;
                            bid.lastBought = 0;
                            bid.lastSpent = 0;
                            bid.lastEffectiveQty = 0;
                        }
                        console.log(
                            `[worker] Buy bid cancelled for agent '${agentId}' on '${planetId}' resource '${resourceName}'`,
                        );
                        safePostMessage({ type: 'buyBidCancelled', requestId, agentId });
                        break;
                    }
                    case 'setBuyBids': {
                        const { requestId, agentId, planetId, bids } = action;
                        const agent = state.agents.get(agentId);
                        if (!agent) {
                            safePostMessage({ type: 'buyBidsFailed', requestId, reason: 'Agent not found' });
                            break;
                        }
                        const assets = agent.assets[planetId];
                        if (!assets) {
                            safePostMessage({
                                type: 'buyBidsFailed',
                                requestId,
                                reason: `Agent has no assets on planet '${planetId}'`,
                            });
                            break;
                        }
                        if (!assets.market) {
                            assets.market = { sell: {}, buy: {} };
                        }
                        for (const [resourceName, update] of Object.entries(bids)) {
                            if (!assets.market.buy[resourceName]) {
                                let resource = null;
                                outerBidLoop: for (const facility of assets.productionFacilities) {
                                    for (const n of facility.needs) {
                                        if (n.resource.name === resourceName) {
                                            resource = n.resource;
                                            break outerBidLoop;
                                        }
                                    }
                                }
                                if (!resource) {
                                    // Fall back to the global resource catalog for free-trading bids
                                    resource = ALL_RESOURCES.find((r) => r.name === resourceName) ?? null;
                                }
                                if (!resource) {
                                    continue;
                                }
                                assets.market.buy[resourceName] = { resource };
                            }
                            const bid = assets.market.buy[resourceName];
                            if (update.bidPrice !== undefined && update.bidPrice > 0) {
                                bid.bidPrice = update.bidPrice;
                            }
                            if (update.bidQuantity !== undefined && update.bidQuantity >= 0) {
                                bid.bidQuantity = update.bidQuantity;
                            }
                            if (update.bidStorageTarget !== undefined && update.bidStorageTarget >= 0) {
                                bid.bidStorageTarget = update.bidStorageTarget;
                            }
                            if (update.automated !== undefined) {
                                bid.automated = update.automated;
                            }
                        }
                        console.log(`[worker] Buy bids updated for agent '${agentId}' on '${planetId}'`);
                        safePostMessage({ type: 'buyBidsSet', requestId, agentId });
                        break;
                    }
                    case 'claimResources': {
                        const { requestId, agentId, planetId, arableLandQuantity, waterSourceQuantity } = action;
                        const agent = state.agents.get(agentId);
                        const planet = state.planets.get(planetId);
                        if (!agent || !planet) {
                            safePostMessage({
                                type: 'resourcesClaimFailed',
                                requestId,
                                reason: 'Agent or planet not found',
                            });
                            break;
                        }
                        const assets = agent.assets[planetId];
                        if (!assets) {
                            safePostMessage({
                                type: 'resourcesClaimFailed',
                                requestId,
                                reason: `Agent has no assets on planet '${planetId}'`,
                            });
                            break;
                        }

                        // Collapse all untenanted arable land into one pool
                        const arablePool = collapseUntenantedClaims(
                            planet,
                            arableLandResourceType.name,
                            `${planetId}-arable-unclaimed`,
                        );
                        if (!arablePool || arablePool.quantity < arableLandQuantity) {
                            safePostMessage({
                                type: 'resourcesClaimFailed',
                                requestId,
                                reason: `Not enough untenanted arable land — requested ${arableLandQuantity}, available ${arablePool?.quantity ?? 0}`,
                            });
                            break;
                        }

                        // Collapse all untenanted water sources into one pool
                        const waterPool = collapseUntenantedClaims(
                            planet,
                            waterSourceResourceType.name,
                            `${planetId}-water-unclaimed`,
                        );
                        if (!waterPool || waterPool.quantity < waterSourceQuantity) {
                            safePostMessage({
                                type: 'resourcesClaimFailed',
                                requestId,
                                reason: `Not enough untenanted water sources — requested ${waterSourceQuantity}, available ${waterPool?.quantity ?? 0}`,
                            });
                            break;
                        }

                        // Create new claim IDs for this agent
                        const arableClaimId = `${planetId}-arable-${agentId}`;
                        const waterClaimId = `${planetId}-water-${agentId}`;

                        // Split arable land off the pool
                        const arableRatio = arableLandQuantity / arablePool.maximumCapacity;
                        const newArableClaim = {
                            id: arableClaimId,
                            type: arableLandResourceType,
                            quantity: arableLandQuantity,
                            regenerationRate: arablePool.regenerationRate * arableRatio,
                            maximumCapacity: arableLandQuantity,
                            claimAgentId: arablePool.claimAgentId,
                            tenantAgentId: agentId,
                            tenantCostInCoins: Math.floor(arableLandQuantity * 0.01),
                        };
                        arablePool.quantity -= arableLandQuantity;
                        arablePool.regenerationRate -= newArableClaim.regenerationRate;
                        arablePool.maximumCapacity -= arableLandQuantity;
                        planet.resources[arableLandResourceType.name].push(newArableClaim);

                        // Split water source off the pool
                        const waterRatio = waterSourceQuantity / waterPool.maximumCapacity;
                        const newWaterClaim = {
                            id: waterClaimId,
                            type: waterSourceResourceType,
                            quantity: waterSourceQuantity,
                            regenerationRate: waterPool.regenerationRate * waterRatio,
                            maximumCapacity: waterSourceQuantity,
                            claimAgentId: waterPool.claimAgentId,
                            tenantAgentId: agentId,
                            tenantCostInCoins: Math.floor(waterSourceQuantity * 0.005),
                        };
                        waterPool.quantity -= waterSourceQuantity;
                        waterPool.regenerationRate -= newWaterClaim.regenerationRate;
                        waterPool.maximumCapacity -= waterSourceQuantity;
                        planet.resources[waterSourceResourceType.name].push(newWaterClaim);

                        // Register the tenancy on the agent's assets
                        assets.resourceTenancies.push(arableClaimId, waterClaimId);

                        // Add the government claim owner's claim list if it exists
                        const govAgent = arablePool.claimAgentId ? state.agents.get(arablePool.claimAgentId) : null;
                        if (govAgent) {
                            const govAssets = govAgent.assets[planetId];
                            if (govAssets) {
                                govAssets.resourceClaims.push(arableClaimId, waterClaimId);
                            }
                        }

                        // Build production facilities if the agent doesn't already have them
                        const hasWaterFacility = assets.productionFacilities.some((f) =>
                            f.needs.some((n) => n.resource.name === waterSourceResourceType.name),
                        );
                        const hasAgriFacility = assets.productionFacilities.some((f) =>
                            f.needs.some((n) => n.resource.name === arableLandResourceType.name),
                        );

                        const waterScale = waterSourceQuantity / 1000;
                        const agriScale = arableLandQuantity / 1000;

                        if (!hasWaterFacility) {
                            const waterFacility = makeWaterExtraction(planetId, agentId, waterScale);
                            assets.productionFacilities.push(waterFacility);
                        }
                        if (!hasAgriFacility) {
                            const agriFacility = makeAgriculturalProduction(planetId, agentId, agriScale);
                            assets.productionFacilities.push(agriFacility);
                        }

                        // Build storage if the agent doesn't have one yet
                        if (!assets.storageFacility) {
                            assets.storageFacility = makeStorage({
                                planetId,
                                id: `${agentId}-storage`,
                                name: `${agentId} Storage`,
                            });
                        }

                        console.log(
                            `[worker] Agent '${agentId}' claimed ${arableLandQuantity} arable land and ` +
                                `${waterSourceQuantity} water source on planet '${planetId}'`,
                        );
                        safePostMessage({ type: 'resourcesClaimed', requestId, agentId, arableClaimId, waterClaimId });
                        break;
                    }
                    case 'buildFacility': {
                        const { requestId, agentId, planetId, facilityKey } = action;
                        const agent = state.agents.get(agentId);
                        if (!agent) {
                            safePostMessage({ type: 'facilityBuildFailed', requestId, reason: 'Agent not found' });
                            break;
                        }
                        const assets = agent.assets[planetId];
                        if (!assets) {
                            safePostMessage({
                                type: 'facilityBuildFailed',
                                requestId,
                                reason: `Agent has no assets on planet '${planetId}'`,
                            });
                            break;
                        }
                        const catalogEntry = facilityByName.get(facilityKey);
                        if (!catalogEntry) {
                            safePostMessage({
                                type: 'facilityBuildFailed',
                                requestId,
                                reason: `Unknown facility '${facilityKey}'`,
                            });
                            break;
                        }
                        const facilityId = `${agentId}-${facilityKey.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
                        const newFacility = catalogEntry.factory(planetId, facilityId);
                        newFacility.scale = 1;
                        newFacility.maxScale = 1;
                        assets.productionFacilities.push(newFacility);
                        console.log(`[worker] Agent '${agentId}' built '${facilityKey}' on planet '${planetId}'`);
                        safePostMessage({ type: 'facilityBuilt', requestId, agentId, facilityId });
                        break;
                    }
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

    // -----------------------------------------------------------------
    // Tick loop (recursive setTimeout to avoid drift / overlap)
    // -----------------------------------------------------------------

    const DEBOUNCE_MS = 1000;
    let lastMessagePost = 0;
    let pendingTickMsg: OutboundMessage | null = null;
    let running = true;

    /** Safe wrapper around messagePort.postMessage that swallows EPIPE errors
     *  which occur when the main thread has already torn down the channel
     *  (e.g. during pool.destroy() or process shutdown). */
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

    function tryFlushMessages(now: number) {
        if (pendingTickMsg && now - lastMessagePost >= DEBOUNCE_MS) {
            safePostMessage(pendingTickMsg);
            lastMessagePost = now;
            pendingTickMsg = null;
        }
    }

    // -----------------------------------------------------------------
    // Agent monthly history tracking
    // -----------------------------------------------------------------

    // Track agent deposits at the start of each month to calculate monthly net income
    const agentMonthlyDeposits = new Map<string, Map<string, number>>(); // agentId -> planetId -> deposits

    /**
     * Update agent monthly history at month boundaries (every 30 ticks).
     */
    function updateAgentMonthlyHistory(gs: GameState, tick: number): void {
        const agentRows = [...gs.agents.values()].flatMap((agent) => {
            return Object.entries(agent.assets).map(([planetId, assets]) => {
                const currentDeposits = assets.deposits;
                const currentLoans = assets.loans;
                const netBalance = currentDeposits - currentLoans;

                // Calculate monthly net income (change in deposits over the month)
                let monthlyNetIncome = 0;

                if (agentMonthlyDeposits.has(agent.id)) {
                    const planetDeposits = agentMonthlyDeposits.get(agent.id)!;
                    if (planetDeposits.has(planetId)) {
                        const previousDeposits = planetDeposits.get(planetId)!;
                        monthlyNetIncome = currentDeposits - previousDeposits;
                    }
                }

                // Update stored deposits for next month
                if (!agentMonthlyDeposits.has(agent.id)) {
                    agentMonthlyDeposits.set(agent.id, new Map());
                }
                agentMonthlyDeposits.get(agent.id)!.set(planetId, currentDeposits);

                // Calculate total workers
                const totalWorkers = Object.values(assets.allocatedWorkers || {}).reduce(
                    (sum, count) => sum + (count || 0),
                    0,
                );

                // Calculate additional metrics
                const facilityCount = assets.productionFacilities?.length || 0;

                // Calculate storage value (sum of all stored resources)
                let storageValue = 0;
                if (assets.storageFacility?.currentInStorage) {
                    for (const entry of Object.values(assets.storageFacility.currentInStorage)) {
                        if (entry?.quantity) {
                            storageValue += entry.quantity; // Simplified - could use market prices
                        }
                    }
                }

                // Calculate production value from last tick
                let productionValue = 0;
                if (assets.productionFacilities) {
                    for (const facility of assets.productionFacilities) {
                        if (facility.lastTickResults?.lastProduced) {
                            for (const qty of Object.values(facility.lastTickResults.lastProduced)) {
                                productionValue += qty; // Simplified - could use market prices
                            }
                        }
                    }
                }

                return {
                    tick,
                    planet_id: planetId,
                    agent_id: agent.id,
                    net_balance: netBalance,
                    monthly_net_income: monthlyNetIncome,
                    total_workers: totalWorkers,
                    production_value: productionValue,
                    facility_count: facilityCount,
                    storage_value: storageValue,
                };
            });
        });

        // Store agent rows for later insertion with the snapshot
        pendingAgentMonthlyRows.push(...agentRows);
    }

    // Store agent monthly rows until snapshot time
    const pendingAgentMonthlyRows: Array<{
        tick: number;
        planet_id: string;
        agent_id: string;
        net_balance: number;
        monthly_net_income: number;
        total_workers: number;
        production_value: number;
        facility_count: number;
        storage_value: number;
    }> = [];

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

                // Record per-planet population alongside the cold snapshot.
                // Clamp tiny values to 0 — values below ~1e-300 are
                // meaningless and can overflow PostgreSQL's float range.
                const clampTiny = (v: number): number => (Math.abs(v) < 1e-300 ? 0 : v);
                const populationRows = [...gs.planets.values()].map((planet) => ({
                    tick,
                    planet_id: planet.id,
                    population: computePopulationTotal(planet),
                    starvation_level: clampTiny(computeGlobalStarvation(planet)),
                    food_price: clampTiny(planet.marketPrices[agriculturalProductResourceType.name] ?? 0),
                }));
                await insertPlanetPopulationHistory(db, populationRows);

                // Insert agent monthly history if we have pending rows
                if (pendingAgentMonthlyRows.length > 0) {
                    await insertAgentMonthlyHistory(db, pendingAgentMonthlyRows);
                    console.log(
                        `[worker] Saved ${pendingAgentMonthlyRows.length} agent monthly history rows for tick ${tick}`,
                    );
                    pendingAgentMonthlyRows.length = 0; // Clear the array

                    // Prune old agent monthly history (keep only last 12 months = 1 year)
                    const prunedAgentHistory = await pruneAgentMonthlyHistory(db);
                    if (prunedAgentHistory > 0) {
                        console.log(
                            `[worker] Pruned ${prunedAgentHistory} old agent monthly history rows (older than 1 year)`,
                        );
                    }
                }

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
            const start = Date.now();
            state.tick += 1;

            // Apply all queued user-driven state mutations before advancing
            // the tick, so they take effect as part of this tick's snapshot.
            drainActionQueue();

            try {
                advanceTick(state);
            } catch (err) {
                console.error('[worker] Error while advancing:', err);
            }

            // Capture an immutable snapshot of the game state.
            // This is O(1) structural-sharing; query handlers can read it
            // without risk of seeing a half-updated state.
            currentSnapshot = toImmutableGameState(state);

            // Update agent monthly history at month boundaries (every 30 ticks)
            if (state.tick % 30 === 0) {
                updateAgentMonthlyHistory(state, state.tick);
            }

            // Periodically persist a cold snapshot for crash recovery.
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
                        data = { conditions: computeLoanConditions(agentRecord.data, planetRecord.data) };
                    }
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

    messagePort?.on('message', (msg: InboundMessage) => {
        if (msg.type === 'ping') {
            const reply: OutboundMessage = { type: 'pong', tick: state.tick };
            safePostMessage(reply);
            return;
        }

        if (msg.type === 'shutdown') {
            running = false;
            console.log('[worker] Received shutdown request — exiting gracefully');
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
            // Enqueue the validated action — it will be applied to state
            // (and the snapshot updated) at the start of the next tick.
            pendingActions.push({ type: 'createAgent', requestId, agentId, agentName, planetId });
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
            return;
        }

        if (msg.type === 'claimResources') {
            const { requestId, agentId, planetId, arableLandQuantity, waterSourceQuantity } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'resourcesClaimFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({ type: 'resourcesClaimFailed', requestId, reason: `Planet '${planetId}' not found` });
                return;
            }
            if (arableLandQuantity <= 0 || waterSourceQuantity <= 0) {
                safePostMessage({
                    type: 'resourcesClaimFailed',
                    requestId,
                    reason: 'arableLandQuantity and waterSourceQuantity must be positive',
                });
                return;
            }
            pendingActions.push({
                type: 'claimResources',
                requestId,
                agentId,
                planetId,
                arableLandQuantity,
                waterSourceQuantity,
            });
            return;
        }

        if (msg.type === 'buildFacility') {
            const { requestId, agentId, planetId, facilityKey } = msg;
            if (!state.agents.has(agentId)) {
                safePostMessage({ type: 'facilityBuildFailed', requestId, reason: 'Agent not found' });
                return;
            }
            if (!state.planets.has(planetId)) {
                safePostMessage({ type: 'facilityBuildFailed', requestId, reason: `Planet '${planetId}' not found` });
                return;
            }
            pendingActions.push({ type: 'buildFacility', requestId, agentId, planetId, facilityKey });
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
