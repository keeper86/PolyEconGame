import path from 'node:path';
import fs from 'node:fs';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { Piscina } from 'piscina';
import { spawnSync } from 'node:child_process';

import type { InboundMessage, OutboundMessage } from '../worker';

export type MessageHandler = (msg: OutboundMessage) => void;

// globalThis-backed singletons prevent duplicate pools when Turbopack
// re-evaluates this module in development.
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

// Walks up from cwd to find tsx in node_modules, because Next.js/Turbopack
// shims require() in a way that makes require.resolve() unreliable.
function resolveTsxExecArgv(): string[] | undefined {
    const tsxCandidates = ['tsx/dist/cjs/index.cjs', 'tsx/dist/cjs/index.js', 'tsx/cjs'];

    let dir = process.cwd();
    while (dir) {
        for (const candidate of tsxCandidates) {
            const full = path.join(dir, 'node_modules', candidate);
            if (fs.existsSync(full)) {
                console.log(`[workerManager] Preloading tsx -> ${full}`);
                return ['--require', full];
            }
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }

    return undefined;
}

function createPool(): { pool: Piscina; port: MessagePort } {
    const bundledWorkerPath = path.resolve(process.cwd(), 'worker.mjs');
    const tsWorkerPath = path.resolve(process.cwd(), 'src', 'simulation', 'worker.ts');
    const useBundledWorker = fs.existsSync(bundledWorkerPath);
    const workerPath = useBundledWorker ? bundledWorkerPath : tsWorkerPath;
    const execArgv = useBundledWorker ? undefined : resolveTsxExecArgv();

    console.log(`[workerManager] Starting simulation worker (${useBundledWorker ? 'bundled' : 'dev/ts'} mode)`);

    if (!useBundledWorker) {
        console.log('[workerManager] execArgv:', execArgv);

        if (execArgv) {
            try {
                const nodeArgs = [
                    ...execArgv,
                    '-e',
                    `try { require(${JSON.stringify(workerPath)}); console.log('__WORKER_IMPORT_OK__'); } catch (e) { console.error(e && (e.stack || e.message) || e); process.exit(1); }`,
                ];
                const res = spawnSync(process.execPath, nodeArgs, { cwd: process.cwd(), encoding: 'utf8' });
                if (res.stdout?.includes('__WORKER_IMPORT_OK__')) {
                    console.log('[workerManager] Worker import preflight OK');
                }
                if (res.status !== 0) {
                    console.error('[workerManager] Worker import preflight failed:');
                    console.error(res.stderr || res.stdout || 'no output');
                    throw new Error('Worker import preflight failed - aborting pool creation');
                }
            } catch (err) {
                console.error(
                    '[workerManager] Worker import preflight threw:',
                    err instanceof Error ? err.stack || err.message : String(err),
                );
                throw err;
            }
        } else {
            console.warn('[workerManager] tsx not found — worker may fail to load TypeScript imports');
        }
    }

    // Piscina owns parentPort for its task protocol, so we use a dedicated
    // MessageChannel for all custom communication with the worker.
    const { port1, port2 } = new MessageChannel();

    const p = new Piscina({
        filename: workerPath,
        minThreads: 1,
        maxThreads: 1,
        idleTimeout: Infinity,
        atomics: 'disabled',
        workerData: { tickIntervalMs: 0 },
        ...(execArgv ? { execArgv } : {}),
    });

    port1.on('message', (msg: OutboundMessage) => {
        getMessageHandlers().forEach((h) => h(msg));
    });

    p.on('error', (err) => {
        console.error('[workerManager] Pool error:', err);
    });

    p.run({ command: 'start', port: port2 }, { transferList: [port2] }).catch((err) => {
        if (getPool() === p) {
            try {
                console.error('[workerManager] Simulation task rejected unexpectedly:', err);
                console.error('[workerManager] rejection details:', {
                    message: err instanceof Error ? err.message : String(err),
                    code: (err as { code?: string })?.code,
                    url: (err as { url?: string })?.url,
                    stack: err instanceof Error ? err.stack : undefined,
                });
            } catch (_e) {
                // swallow logging failures
            }
        }
    });

    console.log('[workerManager] Simulation worker spawned via Piscina.');
    return { pool: p, port: port1 };
}

export function startWorker(): void {
    if (getPool()) {
        return;
    }
    const { pool, port } = createPool();
    setPool(pool);
    setPort(port);
}

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

export function onWorkerMessage(handler: MessageHandler): () => void {
    const handlers = getMessageHandlers();
    handlers.add(handler);
    return () => handlers.delete(handler);
}

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

export async function restartWorker(): Promise<void> {
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

    try {
        getMessageHandlers().forEach((h) => h({ type: 'workerRestarted', reason: 'manual' } as OutboundMessage));
    } catch (err) {
        console.error('[workerManager] Error broadcasting restart message:', err);
    }

    const { pool, port } = createPool();
    setPool(pool);
    setPort(port);
}
