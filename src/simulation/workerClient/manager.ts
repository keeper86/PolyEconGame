import path from 'node:path';
import fs from 'node:fs';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { Piscina } from 'piscina';
import { spawnSync } from 'node:child_process';

import type { InboundMessage, OutboundMessage } from '../worker';
import type { Planet, Agent } from '../planet/planet';
import type { ShipCapitalMarket } from '../ships/ships';
import type { TickerEvent } from '../../server/controller/simulation';
import { rejectAllPending } from './pendingRequests';

export type MessageHandler = (msg: OutboundMessage) => void;

const GLOBAL_KEY_POOL = Symbol.for('__polyecon_worker_pool__');
const GLOBAL_KEY_PORT = Symbol.for('__polyecon_worker_port__');
const GLOBAL_KEY_HANDLERS = Symbol.for('__polyecon_message_handlers__');
const GLOBAL_KEY_TICK = Symbol.for('__polyecon_cached_tick__');
/**
 * Lightweight cached representation of the game state, built from the wire format.
 * Uses pre-built index Maps for fast lookups while avoiding the expensive
 * wireToGameState conversion (no Map reconstruction, no agent defaults pass).
 */
export interface SnapshotCache {
    tick: number;
    planets: Planet[];
    planetsById: Map<string, Planet>;
    agents: Agent[];
    agentsById: Map<string, Agent>;
    /** Pre-built index: planetId → agents that have assets on that planet. O(1) lookup, built once per tick. */
    agentsByPlanetId: Map<string, Agent[]>;
    shipCapitalMarket: ShipCapitalMarket;
    forexMarketMakers: Agent[];
    forexMarketMakersByPlanetId: Map<string, Agent[]>;
    shipbuilderAgents: Agent[];
    arbitrageTraders: Agent[];
    tickerEvents: TickerEvent[];
}

const GLOBAL_KEY_STATE = Symbol.for('__polyecon_cached_state__');

const TICK_UNSET = 0;

export function getLatestTick(): number {
    return (g as Record<symbol, number | undefined>)[GLOBAL_KEY_TICK] ?? TICK_UNSET;
}

export function getCachedGameState(): SnapshotCache | null {
    return (g as Record<symbol, SnapshotCache | undefined>)[GLOBAL_KEY_STATE] ?? null;
}

const g = globalThis as unknown as {
    [GLOBAL_KEY_POOL]?: Piscina | null;
    [GLOBAL_KEY_PORT]?: MessagePort | null;
    [GLOBAL_KEY_HANDLERS]?: Set<MessageHandler>;
    [GLOBAL_KEY_TICK]?: number;
    [GLOBAL_KEY_STATE]?: SnapshotCache;
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

    const { port1, port2 } = new MessageChannel();

    const tickIntervalMs = process.env.TICK_INTERVAL_MS ? parseInt(process.env.TICK_INTERVAL_MS, 10) : 0;

    const p = new Piscina({
        filename: workerPath,
        minThreads: 1,
        maxThreads: 1,
        idleTimeout: Infinity,
        atomics: 'disabled',
        workerData: { tickIntervalMs },
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
                // do nothing
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

    // Listen for tick broadcasts from the worker to update the cached tick.
    onWorkerMessage((msg: OutboundMessage) => {
        if (msg.type === 'tick') {
            (g as Record<symbol, number>)[GLOBAL_KEY_TICK] = msg.tick;
        }
    });

    // Listen for snapshot broadcasts — the wire-format state arrives already
    // deserialized by structured clone (no msgpack/gunzip).  Build index Maps
    // for fast lookups in a single O(n) pass per array.
    onWorkerMessage((msg: OutboundMessage) => {
        if (msg.type !== 'snapshot') {
            return;
        }
        const { data, tickerEvents } = msg;

        // Update tick immediately
        (g as Record<symbol, number>)[GLOBAL_KEY_TICK] = data.tick;

        // Build lookup indexes (one pass per array, avoids wireToGameState overhead)
        const planetsById = new Map<string, Planet>();
        for (const p of data.planets) {
            planetsById.set(p.id, p);
        }
        const agentsById = new Map<string, Agent>();
        for (const a of data.agents) {
            agentsById.set(a.id, a);
        }

        // Build planet→agents index in a single pass (avoids O(N) filter in syncQueries)
        const agentsByPlanetId = new Map<string, Agent[]>();
        for (const a of data.agents) {
            for (const planetId of Object.keys(a.assets)) {
                const list = agentsByPlanetId.get(planetId);
                if (list) {
                    list.push(a);
                } else {
                    agentsByPlanetId.set(planetId, [a]);
                }
            }
        }

        // Build planet→forexMMs index similarly
        const forexMMs = data.forexMarketMakers ?? [];
        const forexMarketMakersByPlanetId = new Map<string, Agent[]>();
        for (const mm of forexMMs) {
            for (const planetId of Object.keys(mm.assets)) {
                const list = forexMarketMakersByPlanetId.get(planetId);
                if (list) {
                    list.push(mm);
                } else {
                    forexMarketMakersByPlanetId.set(planetId, [mm]);
                }
            }
        }

        const cache: SnapshotCache = {
            tick: data.tick,
            planets: data.planets,
            planetsById,
            agents: data.agents,
            agentsById,
            agentsByPlanetId,
            shipCapitalMarket: data.shipCapitalMarket ?? { tradeHistory: [], emaPrice: {} },
            forexMarketMakers: forexMMs,
            forexMarketMakersByPlanetId,
            shipbuilderAgents: data.shipbuilderAgents ?? [],
            arbitrageTraders: data.arbitrageTraders ?? [],
            tickerEvents: tickerEvents ?? [],
        };

        (g as Record<symbol, SnapshotCache>)[GLOBAL_KEY_STATE] = cache;
    });
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
    rejectAllPending('Worker stopped');
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
        rejectAllPending('Worker restarting');
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
