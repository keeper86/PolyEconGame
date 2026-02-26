/**
 * simulation/workerManager.ts
 *
 * Manages the lifecycle of the simulation worker thread:
 *   - spawn on startup
 *   - crash detection + optional restart
 *   - graceful shutdown
 *   - typed message helpers
 *
 * Must only be imported on the server side.
 */

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import type { WorkerOptions } from 'node:worker_threads';

import type { InboundMessage, OutboundMessage } from './worker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageHandler = (msg: OutboundMessage) => void;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let worker: Worker | null = null;
const messageHandlers = new Set<MessageHandler>();
let isShuttingDown = false;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveWorkerPath(): string {
    // Try a few likely locations in order (compiled Next.js output first,
    // then project source locations). Return the first path that exists.
    // This makes the worker more robust across dev (tsx/ts-node) and prod
    // (Next.js compiled) environments.
    const candidates = [
        // Source locations (TS/JS) — prefer these in dev so we pick up
        // the latest source code rather than stale compiled bundles.
        path.resolve(process.cwd(), 'src', 'engine', 'worker.ts'),
        path.resolve(process.cwd(), 'src', 'engine', 'worker.js'),
        path.resolve(process.cwd(), 'simulation', 'worker.ts'),
        path.resolve(process.cwd(), 'simulation', 'worker.js'),
        // Local compiled JS (if project uses a build step into a dist/ or lib/)
        path.resolve(process.cwd(), 'dist', 'engine', 'worker.js'),
        path.resolve(process.cwd(), 'lib', 'engine', 'worker.js'),
        // Next.js server build output (common layout)
        path.resolve(process.cwd(), '.next', 'server', 'simulation', 'worker.js'),
        path.resolve(process.cwd(), '.next', 'server', 'src', 'engine', 'worker.js'),
        path.resolve(process.cwd(), '.next', 'server', 'worker.js'),
    ];
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                return p;
            }
        } catch (_e) {
            // ignore and continue
        }
    }

    // If the static candidates didn't match (files were moved), try a
    // short recursive search starting from the project root. Limit the
    // search depth to avoid scanning node_modules or the whole FS.
    const searchNames = ['worker.ts', 'worker.js', 'worker.mjs', 'worker.cjs'];

    function findInDir(dir: string, depth: number): string | null {
        if (depth <= 0) {
            return null;
        }
        let entries: string[];
        try {
            entries = fs.readdirSync(dir);
        } catch (_e) {
            return null;
        }

        for (const name of entries) {
            const full = path.join(dir, name);
            try {
                const st = fs.statSync(full);
                if (st.isFile() && searchNames.includes(name)) {
                    return full;
                }
                if (st.isDirectory() && name !== 'node_modules' && name !== '.git') {
                    const found = findInDir(full, depth - 1);
                    if (found) {
                        return found;
                    }
                }
            } catch (_e) {
                // ignore permission errors etc.
            }
        }
        return null;
    }

    const root = process.cwd();
    const found = findInDir(root, 4);
    if (found) {
        console.log(`[workerManager] Found worker via recursive search: ${found}`);
        return found;
    }

    // Final fallback: keep previous behaviour but log more guidance.
    const fallback = path.resolve(process.cwd(), 'simulation', 'worker.ts');
    console.warn('[workerManager] Could not locate simulation worker in expected locations. Falling back to', fallback);
    console.warn(
        '[workerManager] If the worker file was moved, consider adding its path to resolveWorkerPath candidates or ensure a compiled JS version exists (worker.js).',
    );
    return fallback;
}

function spawnWorker(): Worker {
    const workerPath = resolveWorkerPath();

    // Build worker options, adding a preload for `tsx/cjs` only when available
    // so we don't crash when that package isn't installed.
    const requireFn = createRequire(process.cwd() + '/');
    const options: WorkerOptions = { workerData: { tickIntervalMs: 0 } };

    // Try to resolve a working tsx require target. Some `tsx` versions expose
    // different entry points (e.g. `tsx/cjs` vs `tsx`). Resolve the actual
    // path and pass that to `--require` to avoid module-not-found inside the
    // worker's preload stage.
    const tsxCandidates = ['tsx/cjs', 'tsx', 'tsx/register'];
    for (const name of tsxCandidates) {
        try {
            const resolved = requireFn.resolve(name);
            options.execArgv = ['--require', resolved];
            console.log(`[workerManager] Preloading ${name} -> ${resolved}`);
            break;
        } catch (_e) {
            // try next candidate
        }
    }

    // Log the worker path and options for easier debugging when spawn fails.
    console.log(`[workerManager] Spawning worker at: ${workerPath}`);
    console.log('[workerManager] Worker options:', { execArgv: options.execArgv, workerData: options.workerData });

    let w: Worker;
    try {
        w = new Worker(workerPath, options);
    } catch (spawnErr) {
        console.error(
            '[workerManager] Failed to spawn worker with execArgv, trying fallback without preload.',
            spawnErr,
        );
        // If we tried to preload tsx and the spawn failed synchronously, try
        // again without the preload to avoid tight restart loops.
        if (options.execArgv) {
            const fallbackOpts: WorkerOptions = { workerData: options.workerData };
            console.log('[workerManager] Retrying worker spawn without execArgv.');
            w = new Worker(workerPath, fallbackOpts);
        } else {
            throw spawnErr;
        }
    }

    w.on('message', (msg: OutboundMessage) => {
        messageHandlers.forEach((h) => h(msg));
    });

    w.on('error', (err) => {
        console.error('[workerManager] Worker error:', err);
    });

    w.on('exit', (code) => {
        if (!isShuttingDown) {
            console.warn(`[workerManager] Worker exited unexpectedly (code ${code}). Restarting…`);
            worker = spawnWorker();
        } else {
            console.log('[workerManager] Worker shut down gracefully.');
        }
    });

    console.log('[workerManager] Simulation worker spawned.');
    return w;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the simulation worker.
 * Safe to call multiple times – only one worker is kept alive.
 */
export function startWorker(): void {
    if (worker) {
        return;
    }
    isShuttingDown = false;
    worker = spawnWorker();
}

/**
 * Send a typed message to the worker.
 */
export function sendToWorker(msg: InboundMessage): void {
    if (!worker) {
        throw new Error('Worker is not running');
    }
    worker.postMessage(msg);
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
    if (!worker) {
        return;
    }
    isShuttingDown = true;
    await worker.terminate();
    worker = null;
}

/**
 * Restart the worker: terminate if running, then spawn a fresh instance.
 * Intended for development hot-reload / manual restarts.
 */
export async function restartWorker(): Promise<void> {
    // If there's an existing worker, terminate it first.
    if (worker) {
        isShuttingDown = true;
        try {
            // Ask the worker to shut itself down first (graceful). If it doesn't
            // exit within the timeout we fall back to forceful termination.
            const w = worker;
            try {
                if (w) {
                    w.postMessage({ type: 'shutdown' } as InboundMessage);
                }
            } catch (_e) {
                // ignore if posting fails
            }

            await new Promise<void>((resolve) => {
                let settled = false;
                const onExit = () => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    clearTimeout(timer);
                    resolve();
                };

                if (w) {
                    w.once('exit', onExit);
                }

                const timer = setTimeout(async () => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    try {
                        if (w) {
                            await w.terminate();
                        }
                    } catch (_err) {
                        // ignore
                    }
                    resolve();
                }, 2000);
            });
        } catch (err) {
            console.error('[workerManager] Error terminating worker during restart:', err);
        }
        worker = null;
    }

    // Notify connected listeners that a restart is happening so clients can reset
    // any derived UI state (e.g. time series) before the fresh worker sends new state.
    try {
        messageHandlers.forEach((h) =>
            // broadcast a small control message; the union type includes this variant.
            h({ type: 'workerRestarted', reason: 'manual' } as OutboundMessage),
        );
    } catch (err) {
        console.error('[workerManager] Error broadcasting restart message:', err);
    }

    // Reset shutdown flag and start a new worker instance.
    isShuttingDown = false;
    worker = spawnWorker();
}
