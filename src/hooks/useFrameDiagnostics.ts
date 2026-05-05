let frameCount = 0;
let lastFrameTime = 0;
let droppedFrames = 0;
let lastQueryResolveTime = 0;
let lastQueryKey: string = '';

function logFrameDrop(deltaMs: number, sinceLastQueryMs: number) {
    console.warn(
        `[FrameDiag] 🐌 Frame #${frameCount} dropped — ` +
            `delta=${deltaMs.toFixed(1)}ms, ` +
            `sinceLastQuery=${sinceLastQueryMs.toFixed(1)}ms` +
            (lastQueryKey ? `, lastQuery=${lastQueryKey}` : '') +
            `, totalDropped=${droppedFrames}`,
    );
}

/* ---------- public API ---------- */

/**
 * Call once in the animation loop to detect frame drops.
 * Returns the delta (ms) since the last frame, or 0 if disabled.
 */
export function checkFrame(now: number): number {
    frameCount++;
    if (lastFrameTime === 0) {
        lastFrameTime = now;
        return 0;
    }

    const delta = now - lastFrameTime;
    lastFrameTime = now;

    // A frame at 60fps should arrive every ~16.7ms.
    // Flag anything > 50ms as a drop (3 consecutive missed frames).
    if (delta > 50) {
        droppedFrames++;
        const sinceLastQuery = lastQueryResolveTime > 0 ? now - lastQueryResolveTime : -1;
        logFrameDrop(delta, sinceLastQuery);
    }

    return delta;
}

/**
 * Call when a TanStack Query response is processed (i.e. setData / onSuccess).
 * Records the timestamp so we can correlate frame drops with query activity.
 *
 * @param queryKey Optional — a short string identifying the query (e.g. "getTickerEvents").
 */
export function markQueryResolved(queryKey?: string): void {
    lastQueryResolveTime = performance.now();
    if (queryKey) {
        lastQueryKey = queryKey;
    }
}

/**
 * Reset counters (useful for hot-reload).
 */
export function resetDiagnostics(): void {
    frameCount = 0;
    lastFrameTime = 0;
    droppedFrames = 0;
    lastQueryResolveTime = 0;
    lastQueryKey = '';
}
