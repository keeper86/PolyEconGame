/**
 * simulation/worker.ts
 *
 * Runs inside a Piscina worker thread.
 * Owns the authoritative GameState and advances it on every tick.
 * Communicates with the main process via parentPort messages.
 *
 * Exports a default function that Piscina calls to start the simulation.
 * The function returns a Promise that never resolves (the loop runs until
 * the thread is terminated).
 */

import { parentPort, workerData } from 'node:worker_threads';
import { advanceTick, type GameState } from './engine';
import { alphaCentauri, earth, earthGovernment } from './entities';
import { type Population, type TransportShip } from './planet';
import { agriculturalProductResourceType, putIntoStorageFacility, waterResourceType } from './facilities';
import { db } from '../server/db';
import { saveGameStateSnapshot } from '../server/snapshotRepository';

export type InboundMessage =
    | { type: 'ping' }
    | { type: 'createShip'; from: string; to: string; cargo: { metal: number; energy: number }; eta?: number }
    | { type: 'shutdown' };

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
    | { type: 'workerRestarted'; reason?: string };

// ---------------------------------------------------------------------------
// Default export — entry point called by Piscina
// ---------------------------------------------------------------------------

export default function simulationTask(): Promise<void> {
    // -----------------------------------------------------------------
    // State  (private to this worker invocation)
    // -----------------------------------------------------------------

    const TICK_INTERVAL_MS: number = typeof workerData?.tickIntervalMs === 'number' ? workerData.tickIntervalMs : 0;

    const state: GameState = {
        tick: 0,
        planets: [earth, alphaCentauri],
        agents: [earthGovernment],
    };

    const earthGovernmentStorage = earthGovernment.assets[earth.id]?.storageFacility;
    if (!earthGovernmentStorage) {
        throw new Error('Earth government has no storage facility');
    }

    console.log(
        'put in food',
        putIntoStorageFacility(earthGovernmentStorage, agriculturalProductResourceType, 10000000000),
    );
    console.log('put in water', putIntoStorageFacility(earthGovernmentStorage, waterResourceType, 100000));

    // -----------------------------------------------------------------
    // Tick loop (recursive setTimeout to avoid drift / overlap)
    // -----------------------------------------------------------------

    const DEBOUNCE_MS = 1000;
    let lastMessagePost = 0;
    let pendingTickMsg: OutboundMessage | null = null;
    let running = true;

    /** Safe wrapper around parentPort.postMessage that swallows EPIPE errors
     *  which occur when the main thread has already torn down the channel
     *  (e.g. during pool.destroy() or process shutdown). */
    function safePostMessage(msg: OutboundMessage): void {
        try {
            parentPort?.postMessage(msg);
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

    function scheduleTick(): void {
        setTimeout(async () => {
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

            const elapsedMs = Date.now() - start;
            console.log(`[worker] Tick ${state.tick} completed in ${elapsedMs}ms`);

            // Persist snapshot directly to the database from the worker thread.
            try {
                await saveGameStateSnapshot(db, state);
            } catch (err) {
                console.error('[worker] Failed to save snapshot for tick', state.tick, err);
            }

            pendingTickMsg = { type: 'tick', tick: state.tick, elapsedMs };
            tryFlushMessages(Date.now());

            scheduleTick();
        }, TICK_INTERVAL_MS);
    }

    // -----------------------------------------------------------------
    // Message handler
    // -----------------------------------------------------------------

    parentPort?.on('message', (msg: InboundMessage) => {
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
