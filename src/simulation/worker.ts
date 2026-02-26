/**
 * simulation/worker.ts
 *
 * Runs inside a dedicated worker_thread.
 * Owns the authoritative GameState and advances it on every tick.
 * Communicates with the main process via parentPort messages.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { advanceTick, type GameState } from './engine';
import { alphaCentauri, earth, earthGovernment } from './entities';
import { type Population, type TransportShip } from './planet';
import { agriculturalProductResourceType, putIntoStorageFacility, waterResourceType } from './facilities';

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
    | { type: 'populationUpdated'; planetId: string; population: Population; tick: number }
    | { type: 'state'; state: GameState }
    // Sent by the manager to notify connected clients that the worker was restarted
    // (useful for client-side UI reset/hot-reload logic).
    | { type: 'workerRestarted'; reason?: string };

// ---------------------------------------------------------------------------
// State  (private to this worker)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tick loop (recursive setTimeout to avoid drift / overlap)
// ---------------------------------------------------------------------------

// Debounce outgoing messages so the frontend only receives updates at most once
// per second. Internally the tick loop can run as fast as TICK_INTERVAL_MS allows.
const DEBOUNCE_MS = 1000;
let lastMessagePost = 0;
let pendingTickMsg: OutboundMessage | null = null;
let pendingStateMsg: OutboundMessage | null = null;
let running = true;

function tryFlushMessages(now: number) {
    if (pendingTickMsg && pendingStateMsg && now - lastMessagePost >= DEBOUNCE_MS) {
        parentPort?.postMessage(pendingTickMsg);
        parentPort?.postMessage(pendingStateMsg);
        lastMessagePost = now;
        pendingTickMsg = null;
        pendingStateMsg = null;
    }
}

function scheduleTick(): void {
    setTimeout(() => {
        if (!running) {
            return;
        }
        const start = Date.now();
        state.tick += 1;

        // Evolve population on each tick (we treat one tick ~= one year here).
        try {
            advanceTick(state);
        } catch (err) {
            console.error('[worker] Error while advancing:', err);
        }

        const elapsedMs = Date.now() - start;
        console.log(`[worker] Tick ${state.tick} completed in ${elapsedMs}ms`);

        // Buffer the latest tick and state; flush at most once per DEBOUNCE_MS.
        pendingTickMsg = { type: 'tick', tick: state.tick, elapsedMs };
        pendingStateMsg = { type: 'state', state };
        tryFlushMessages(Date.now());

        scheduleTick();
    }, TICK_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

parentPort?.on('message', (msg: InboundMessage) => {
    if (msg.type === 'ping') {
        const reply: OutboundMessage = { type: 'pong', tick: state.tick };
        parentPort?.postMessage(reply);
        return;
    }

    if (msg.type === 'shutdown') {
        // Stop scheduling further ticks and exit the worker thread gracefully.
        running = false;
        console.log('[worker] Received shutdown request — exiting gracefully');
        try {
            setTimeout(() => process.exit(0), 50);
        } catch (_e) {
            process.exit(0);
        }
    }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

console.log(`[worker] Simulation worker started (tick interval: ${TICK_INTERVAL_MS}ms)`);
scheduleTick();
