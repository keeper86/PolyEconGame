import { randomUUID } from 'node:crypto';
import { sendToWorker, onWorkerMessage } from './manager';
import type { InboundMessage, OutboundMessage } from './messages';
import type { CommandSpec } from './commandSpec';
import type { WorkerQuery, WorkerQueryResult, WorkerSuccessResponse, WorkerErrorResponse } from '../queries';

interface PendingRequest<T = unknown> {
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
}

// globalThis-backed singletons prevent duplicate state when Turbopack
// re-evaluates this module in development.
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

export const DEFAULT_TIMEOUT_MS = 5_000;

function ensureQueryResponseListener(): void {
    if (g[GLOBAL_KEY_LISTENER]) {
        return;
    }
    g[GLOBAL_KEY_LISTENER] = true;

    onWorkerMessage((msg: OutboundMessage) => {
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

export function sendQuery<T extends WorkerQuery['type']>(
    query: Extract<WorkerQuery, { type: T }>,
    timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<WorkerQueryResult[T]> {
    ensureQueryResponseListener();

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

export function sendCommandSpec<
    TInbound extends InboundMessage & { requestId: string },
    TSuccess extends OutboundMessage & { requestId: string },
    TFailure extends OutboundMessage & { requestId: string; reason: string },
    TResult,
>(
    message: TInbound,
    spec: CommandSpec<TInbound, TSuccess, TFailure, TResult>,
    timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<TResult> {
    ensureQueryResponseListener();

    const { requestId } = message;

    return new Promise<TResult>((resolve, reject) => {
        const unsubscribe = onWorkerMessage((msg: OutboundMessage) => {
            if (msg.type !== spec.successType && msg.type !== spec.failureType) {
                return;
            }
            if ((msg as { requestId?: string }).requestId !== requestId) {
                return;
            }

            unsubscribe();
            const entry = getPending().get(requestId);
            if (!entry) {
                return;
            }
            getPending().delete(requestId);
            clearTimeout(entry.timer);

            if (msg.type === spec.failureType) {
                entry.reject(new Error((msg as TFailure).reason));
            } else {
                entry.resolve(spec.extract(msg as TSuccess));
            }
        });

        const timer = setTimeout(() => {
            unsubscribe();
            getPending().delete(requestId);
            reject(new Error(`Worker command '${message.type}' timed out after ${timeoutMs}ms (id=${requestId})`));
        }, timeoutMs);

        getPending().set(requestId, {
            resolve: resolve as (value: unknown) => void,
            reject,
            timer,
        });

        try {
            sendToWorker(message as never);
        } catch (err) {
            unsubscribe();
            getPending().delete(requestId);
            clearTimeout(timer);
            reject(err);
        }
    });
}

export function rejectAllPending(reason = 'Worker shut down'): void {
    const p = getPending();
    for (const [id, entry] of p) {
        clearTimeout(entry.timer);
        entry.reject(new Error(reason));
        p.delete(id);
    }
}
