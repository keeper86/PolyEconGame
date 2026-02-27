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
import { Piscina } from 'piscina';

import type { InboundMessage, OutboundMessage } from './worker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageHandler = (msg: OutboundMessage) => void;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let pool: Piscina | null = null;
const messageHandlers = new Set<MessageHandler>();

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

function createPool(): Piscina {
    // __dirname is unreliable inside Next.js bundles (resolves to /ROOT/…).
    // Use process.cwd() which always points to the real project root.
    const workerPath = path.resolve(process.cwd(), 'src', 'simulation', 'worker.ts');
    const execArgv = resolveTsxExecArgv();

    console.log(`[workerManager] Creating Piscina pool with worker: ${workerPath}`);
    console.log('[workerManager] Pool options:', { execArgv, workerData: { tickIntervalMs: 0 } });

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

    // Forward worker messages to registered handlers.
    p.on('message', (msg: OutboundMessage) => {
        messageHandlers.forEach((h) => h(msg));
    });

    p.on('error', (err) => {
        console.error('[workerManager] Pool error:', err);
    });

    // Submit the long-running simulation task. The returned promise only
    // settles when the worker exits (resolve on graceful stop, reject on
    // crash). We intentionally do not await it here.
    p.run({ command: 'start' }).catch((err) => {
        // If the pool was intentionally destroyed the rejection is expected.
        if (pool === p) {
            console.error('[workerManager] Simulation task rejected unexpectedly:', err);
        }
    });

    console.log('[workerManager] Simulation worker spawned via Piscina.');
    return p;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the simulation worker.
 * Safe to call multiple times – only one worker is kept alive.
 */
export function startWorker(): void {
    if (pool) {
        return;
    }
    pool = createPool();
}

/**
 * Send a typed message to the worker.
 */
export function sendToWorker(msg: InboundMessage): void {
    if (!pool) {
        throw new Error('Worker is not running');
    }
    // Piscina exposes the underlying Worker instances via `threads`.
    const threads = pool.threads;
    if (threads.length === 0) {
        throw new Error('No worker threads available');
    }
    threads[0].postMessage(msg);
}

/**
 * Register a listener for messages coming from the worker.
 * Returns an unsubscribe function.
 */
export function onWorkerMessage(handler: MessageHandler): () => void {
    messageHandlers.add(handler);
    return () => messageHandlers.delete(handler);
}

/**
 * Terminate the worker gracefully.
 */
export async function stopWorker(): Promise<void> {
    if (!pool) {
        return;
    }
    const p = pool;
    pool = null;
    await p.destroy();
    console.log('[workerManager] Worker shut down gracefully.');
}

/**
 * Restart the worker: terminate if running, then spawn a fresh instance.
 * Intended for development hot-reload / manual restarts.
 */
export async function restartWorker(): Promise<void> {
    // Tear down existing pool.
    if (pool) {
        const p = pool;
        pool = null;
        try {
            await p.destroy();
        } catch (err) {
            console.error('[workerManager] Error destroying pool during restart:', err);
        }
    }

    // Notify connected listeners that a restart is happening so clients can
    // reset any derived UI state before the fresh worker sends new state.
    try {
        messageHandlers.forEach((h) => h({ type: 'workerRestarted', reason: 'manual' } as OutboundMessage));
    } catch (err) {
        console.error('[workerManager] Error broadcasting restart message:', err);
    }

    // Spawn a fresh pool.
    pool = createPool();
}
