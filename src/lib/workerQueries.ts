/**
 * lib/workerQueries.ts
 *
 * Main-thread client for sending typed queries to the simulation worker and
 * receiving typed responses.
 *
 * Uses the existing `sendToWorker` / `onWorkerMessage` infrastructure from
 * `workerManager.ts`.  Each query gets a unique `requestId`; the response is
 * correlated by that ID via a pending-promise map.
 *
 * Usage:
 *   import { workerQueries } from '@/lib/workerQueries';
 *   const { tick } = await workerQueries.getCurrentTick();
 *   const { planet } = await workerQueries.getPlanet('earth');
 */

import { randomUUID } from 'node:crypto';
import { sendToWorker, onWorkerMessage } from '../simulation/workerManager';
import type { OutboundMessage } from '../simulation/worker';
import type { WorkerQuery, WorkerQueryResult, WorkerSuccessResponse, WorkerErrorResponse } from '../simulation/queries';

// ---------------------------------------------------------------------------
// Pending-request bookkeeping
//
// Like workerManager.ts we use globalThis-backed singletons so that
// Turbopack module re-evaluation in development doesn't create duplicates.
// ---------------------------------------------------------------------------

interface PendingRequest<T = unknown> {
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
}

const GLOBAL_KEY_PENDING = Symbol.for('__polyecon_workerQueries_pending__');
const GLOBAL_KEY_LISTENER = Symbol.for('__polyecon_workerQueries_listener__');

const g = globalThis as unknown as {
    [GLOBAL_KEY_PENDING]?: Map<string, PendingRequest>;
    [GLOBAL_KEY_LISTENER]?: boolean;
};

function getPending(): Map<string, PendingRequest> {
    if (!g[GLOBAL_KEY_PENDING]) {
        g[GLOBAL_KEY_PENDING] = new Map<string, PendingRequest>();
    }
    return g[GLOBAL_KEY_PENDING];
}

/** Default query timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Message listener (registered once across all module contexts)
// ---------------------------------------------------------------------------

function ensureListener(): void {
    if (g[GLOBAL_KEY_LISTENER]) {
        return;
    }
    g[GLOBAL_KEY_LISTENER] = true;

    onWorkerMessage((msg: OutboundMessage) => {
        // Only handle query-related response messages.
        if (msg.type !== 'queryResponse' && msg.type !== 'queryError') {
            return;
        }

        const requestId = (msg as { requestId?: string }).requestId;
        if (!requestId) {
            return;
        }

        const entry = getPending().get(requestId);
        if (!entry) {
            return;
        }
        getPending().delete(requestId);
        clearTimeout(entry.timer);

        if (msg.type === 'queryError') {
            entry.reject(new Error((msg as WorkerErrorResponse).error));
        } else {
            entry.resolve((msg as WorkerSuccessResponse).data);
        }
    });
}

// ---------------------------------------------------------------------------
// Generic sendQuery
// ---------------------------------------------------------------------------

/**
 * Send a query to the simulation worker and return a promise that resolves
 * with the typed result.
 *
 * @param query  The query payload (type + parameters).
 * @param timeoutMs  How long to wait before rejecting with a timeout error.
 */
function sendQuery<T extends WorkerQuery['type']>(
    query: Extract<WorkerQuery, { type: T }>,
    timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<WorkerQueryResult[T]> {
    ensureListener();

    const requestId = randomUUID();

    return new Promise<WorkerQueryResult[T]>((resolve, reject) => {
        const timer = setTimeout(() => {
            getPending().delete(requestId);
            reject(new Error(`Worker query '${query.type}' timed out after ${timeoutMs}ms (id=${requestId})`));
        }, timeoutMs);

        getPending().set(requestId, {
            resolve: resolve as (value: unknown) => void,
            reject,
            timer,
        });

        try {
            sendToWorker({ ...query, requestId } as never);
        } catch (err) {
            getPending().delete(requestId);
            clearTimeout(timer);
            reject(err);
        }
    });
}

// ---------------------------------------------------------------------------
// Typed client API
// ---------------------------------------------------------------------------

export const workerQueries = {
    /** Get the current simulation tick number. */
    getCurrentTick: () => sendQuery({ type: 'getCurrentTick' }),

    /** Get the full game state (all planets + agents). */
    getFullState: () => sendQuery({ type: 'getFullState' }),

    /** Get a single planet by ID. */
    getPlanet: (planetId: string) => sendQuery({ type: 'getPlanet', planetId }),

    /** Get all planets. */
    getAllPlanets: () => sendQuery({ type: 'getAllPlanets' }),

    /** Get a single agent by ID. */
    getAgent: (agentId: string) => sendQuery({ type: 'getAgent', agentId }),

    /** Get all agents. */
    getAllAgents: () => sendQuery({ type: 'getAllAgents' }),

    /** Get all agents associated with a planet. */
    getAgentsByPlanet: (planetId: string) => sendQuery({ type: 'getAgentsByPlanet', planetId }),
};

// ---------------------------------------------------------------------------
// Cleanup helper (useful in tests)
// ---------------------------------------------------------------------------

/** Reject all pending queries and clear internal state.  Called by
 *  `stopWorker` to avoid dangling promises after shutdown. */
export function rejectAllPending(reason = 'Worker shut down'): void {
    const p = getPending();
    for (const [id, entry] of p) {
        clearTimeout(entry.timer);
        entry.reject(new Error(reason));
        p.delete(id);
    }
}
