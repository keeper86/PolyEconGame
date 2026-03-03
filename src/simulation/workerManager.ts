/**
 * simulation/workerManager.ts
 *
 * Manages the lifecycle of the simulation worker thread using Piscina:
 *   - spawn on startup
 *   - crash detection + optional restart
 *   - graceful shutdown
 *   - typed message helpers
 *
 * Must only be imported on the server side.
 */

import path from 'node:path';
import { createRequire } from 'node:module';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { Piscina } from 'piscina';

import type { InboundMessage, OutboundMessage } from './worker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageHandler = (msg: OutboundMessage) => void;

// ---------------------------------------------------------------------------
// Module-level state
//
// In development, Turbopack / Next.js may re-evaluate this module in
// isolated compilation contexts.  Using `globalThis` ensures the Piscina
// pool and message-handler set are true singletons across all module
// instances — preventing duplicate worker threads.
// ---------------------------------------------------------------------------

const GLOBAL_KEY_POOL = Symbol.for('__polyecon_worker_pool__');
const GLOBAL_KEY_PORT = Symbol.for('__polyecon_worker_port__');
const GLOBAL_KEY_HANDLERS = Symbol.for('__polyecon_message_handlers__');

const g = globalThis as unknown as {
    [GLOBAL_KEY_POOL]?: Piscina | null;
    [GLOBAL_KEY_PORT]?: MessagePort | null;
    [GLOBAL_KEY_HANDLERS]?: Set<MessageHandler>;
};

function getPool(): Piscina | null {
    return g[GLOBAL_KEY_POOL] ?? null;
}

function setPool(p: Piscina | null): void {
    g[GLOBAL_KEY_POOL] = p;
}

function getPort(): MessagePort | null {
    return g[GLOBAL_KEY_PORT] ?? null;
}

function setPort(p: MessagePort | null): void {
    g[GLOBAL_KEY_PORT] = p;
}

function getMessageHandlers(): Set<MessageHandler> {
    if (!g[GLOBAL_KEY_HANDLERS]) {
        g[GLOBAL_KEY_HANDLERS] = new Set<MessageHandler>();
    }
    return g[GLOBAL_KEY_HANDLERS];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve tsx preload execArgv (if available), to support TS workers in dev. */
function resolveTsxExecArgv(): string[] | undefined {
    const requireFn = createRequire(process.cwd() + '/');
    const tsxCandidates = ['tsx/cjs', 'tsx', 'tsx/register'];
    for (const name of tsxCandidates) {
        try {
            const resolved = requireFn.resolve(name);
            console.log(`[workerManager] Preloading ${name} -> ${resolved}`);
            return ['--require', resolved];
        } catch (_e) {
            // try next candidate
        }
    }
    return undefined;
}

function createPool(): { pool: Piscina; port: MessagePort } {
    // __dirname is unreliable inside Next.js bundles (resolves to /ROOT/…).
    // Use process.cwd() which always points to the real project root.
    const workerPath = path.resolve(process.cwd(), 'src', 'simulation', 'worker.ts');
    const execArgv = resolveTsxExecArgv();

    console.log(`[workerManager] Creating Piscina pool with worker: ${workerPath}`);
    console.log('[workerManager] Pool options:', { execArgv, workerData: { tickIntervalMs: 0 } });

    // Create a dedicated MessageChannel for custom messages between the main
    // thread and the worker.  Piscina owns `parentPort` for its internal task
    // protocol — sending arbitrary messages via `threads[0].postMessage()`
    // would corrupt that protocol and crash the pool.  Instead we pass one
    // end of the channel (`port2`) to the worker through the task payload and
    // keep the other end (`port1`) here for `sendToWorker` / `onWorkerMessage`.
    const { port1, port2 } = new MessageChannel();

    const p = new Piscina({
        filename: workerPath,
        // Single dedicated simulation thread — not a task pool.
        minThreads: 1,
        maxThreads: 1,
        // The simulation task never completes, so keep the thread alive.
        idleTimeout: Infinity,
        // Piscina pauses the event-loop between tasks by default via Atomics.
        // Our worker runs a perpetual setTimeout loop, so we need async mode.
        atomics: 'disabled',
        workerData: { tickIntervalMs: 0 },
        ...(execArgv ? { execArgv } : {}),
    });

    // Listen for custom messages from the worker on our side of the channel.
    port1.on('message', (msg: OutboundMessage) => {
        getMessageHandlers().forEach((h) => h(msg));
    });

    p.on('error', (err) => {
        console.error('[workerManager] Pool error:', err);
    });

    // Submit the long-running simulation task, passing the worker's end of
    // the MessageChannel.  The `transferList` ensures the port is moved to
    // the worker thread (not copied).
    p.run({ command: 'start', port: port2 }, { transferList: [port2] }).catch((err) => {
        // If the pool was intentionally destroyed the rejection is expected.
        if (getPool() === p) {
            console.error('[workerManager] Simulation task rejected unexpectedly:', err);
        }
    });

    console.log('[workerManager] Simulation worker spawned via Piscina.');
    return { pool: p, port: port1 };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the simulation worker.
 * Safe to call multiple times – only one worker is kept alive.
 */
export function startWorker(): void {
    if (getPool()) {
        return;
    }
    const { pool, port } = createPool();
    setPool(pool);
    setPort(port);
}

/**
 * Send a typed message to the worker via the dedicated MessageChannel.
 * Automatically starts the worker if it is not yet running.
 */
export function sendToWorker(msg: InboundMessage): void {
    if (!getPool()) {
        startWorker();
    }
    const port = getPort();
    if (!port) {
        throw new Error('Worker message port is not available');
    }
    port.postMessage(msg);
}

/**
 * Register a listener for messages coming from the worker.
 * Returns an unsubscribe function.
 */
export function onWorkerMessage(handler: MessageHandler): () => void {
    const handlers = getMessageHandlers();
    handlers.add(handler);
    return () => handlers.delete(handler);
}

/**
 * Terminate the worker gracefully.
 */
export async function stopWorker(): Promise<void> {
    const p = getPool();
    const port = getPort();
    if (!p) {
        return;
    }
    setPool(null);
    if (port) {
        port.close();
        setPort(null);
    }
    await p.destroy();
    console.log('[workerManager] Worker shut down gracefully.');
}

/**
 * Restart the worker: terminate if running, then spawn a fresh instance.
 * Intended for development hot-reload / manual restarts.
 */
export async function restartWorker(): Promise<void> {
    // Tear down existing pool.
    const existing = getPool();
    const existingPort = getPort();
    if (existing) {
        setPool(null);
        if (existingPort) {
            existingPort.close();
            setPort(null);
        }
        try {
            await existing.destroy();
        } catch (err) {
            console.error('[workerManager] Error destroying pool during restart:', err);
        }
    }

    // Notify connected listeners that a restart is happening so clients can
    // reset any derived UI state before the fresh worker sends new state.
    try {
        getMessageHandlers().forEach((h) => h({ type: 'workerRestarted', reason: 'manual' } as OutboundMessage));
    } catch (err) {
        console.error('[workerManager] Error broadcasting restart message:', err);
    }

    // Spawn a fresh pool.
    const { pool, port } = createPool();
    setPool(pool);
    setPort(port);
}
