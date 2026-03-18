export interface PendingRequest<T = unknown> {
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
}

const GLOBAL_KEY_PENDING = Symbol.for('__polyecon_workerQueries_pending__');

const g = globalThis as unknown as {
    [GLOBAL_KEY_PENDING]?: Map<string, PendingRequest>;
};

export function getPending(): Map<string, PendingRequest> {
    if (!g[GLOBAL_KEY_PENDING]) {
        g[GLOBAL_KEY_PENDING] = new Map<string, PendingRequest>();
    }
    return g[GLOBAL_KEY_PENDING];
}

export function rejectAllPending(reason = 'Worker shut down'): void {
    const p = getPending();
    for (const [id, entry] of p) {
        clearTimeout(entry.timer);
        entry.reject(new Error(reason));
        p.delete(id);
    }
}
