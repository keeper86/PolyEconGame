/**
 * simulation/worker.ts
 *
 * Runs inside a Piscina worker thread.
 * Owns the authoritative GameState and advances it on every tick.
 * Communicates with the main process via a dedicated MessagePort (not
 * parentPort, which is owned by Piscina's internal task protocol).
 *
 * Exports a default function that Piscina calls to start the simulation.
 * The function returns a Promise that never resolves (the loop runs until
 * the thread is terminated).
 */

import { parentPort, workerData, type MessagePort } from 'node:worker_threads';
import {
    getLatestGameSnapshot,
    insertGameSnapshot,
    insertPlanetPopulationHistory,
    pruneGameSnapshots,
} from '../server/gameSnapshotRepository';
import { computePopulationTotal, computeGlobalStarvation } from '../server/snapshotRepository';
import { advanceTick, seedRng } from './engine';
import { fromImmutableGameState, toImmutableGameState, type GameStateRecord } from './immutableTypes';
import type { GameState } from './planet/planet';
import { type TransportShip } from './planet/planet';
import type { WorkerErrorResponse, WorkerQueryMessage, WorkerSuccessResponse } from './queries';
import { deserializeSnapshot, serializeGameState } from './snapshotCompression';
import { SNAPSHOT_INTERVAL_TICKS, SNAPSHOT_MAX_RETAINED } from './snapshotConfig';
import { createInitialGameState } from './utils/initialWorld';

export type InboundMessage =
    | { type: 'ping' }
    | { type: 'createShip'; from: string; to: string; cargo: { metal: number; energy: number }; eta?: number }
    | { type: 'shutdown' }
    | WorkerQueryMessage;

export type OutboundMessage =
    | { type: 'pong'; tick: number }
    | { type: 'tick'; tick: number; elapsedMs: number }
    | { type: 'shipArrived'; shipId: string; to: string; cargo: { metal: number; energy: number }; tick: number }
    | { type: 'shipCreated'; ship: TransportShip; tick: number }
    | {
          type: 'shipCreationFailed';
          reason: string;
          requested: { metal: number; energy: number };
          available?: { metal: number; energy: number };
          from?: string;
      }
    // Sent by the manager to notify connected clients that the worker was restarted
    // (useful for client-side UI reset/hot-reload logic).
    | { type: 'workerRestarted'; reason?: string }
    // Query protocol responses
    | WorkerSuccessResponse
    | WorkerErrorResponse;

// ---------------------------------------------------------------------------
// Default export — entry point called by Piscina
// ---------------------------------------------------------------------------

/** Task payload sent by the manager via `pool.run()`. */
interface TaskPayload {
    command: string;
    /** Dedicated MessagePort for custom messages (queries, pings, etc.).
     *  Transferred from the main thread via the Piscina `transferList`. */
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

    function getSnapshotDb(): import('knex').Knex | null {
        if (snapshotDb) {
            return snapshotDb;
        }
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const knexModule = require('knex') as typeof import('knex').default;
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const knexConfig = require('../../knexfile') as { default: Record<string, import('knex').Knex.Config> };
            const isDevelopment = process.env.NODE_ENV === 'development';
            const dbConfig = isDevelopment ? knexConfig.default.development : knexConfig.default.production;

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
        const db = getSnapshotDb();
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

        const db = getSnapshotDb();
        if (!db) {
            return;
        }

        snapshotInFlight = true;
        const gs = fromImmutableGameState(snapshot);

        void (async () => {
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
                    food_price: clampTiny(planet.priceLevel ?? 0),
                }));
                await insertPlanetPopulationHistory(db, populationRows);

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

            try {
                advanceTick(state);
            } catch (err) {
                console.error('[worker] Error while advancing:', err);
            }

            // Capture an immutable snapshot of the game state.
            // This is O(1) structural-sharing; query handlers can read it
            // without risk of seeing a half-updated state.
            currentSnapshot = toImmutableGameState(state);

            // Periodically persist a cold snapshot for crash recovery.
            if (state.tick % SNAPSHOT_INTERVAL_TICKS === 0) {
                spawnSnapshotTask(currentSnapshot, state.tick);
            }

            const elapsedMs = Date.now() - start;
            console.log(`[worker] Tick ${state.tick} completed in ${elapsedMs}ms`);

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
