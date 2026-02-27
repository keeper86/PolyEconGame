/**
 * snapshotPersistence.ts
 *
 * DEPRECATED — Snapshot persistence has been moved into the simulation worker
 * thread itself (worker.ts) so the full GameState no longer needs to be
 * serialised over the message channel.
 *
 * This module is kept as a no-op for backwards compatibility with existing
 * call-sites (e.g. instrumentation.ts).  It can be safely removed once all
 * callers have been updated.
 */

/**
 * @deprecated No-op. Snapshot persistence now happens inside the worker thread.
 */
export function registerSnapshotPersistence(): void {
    console.log(
        '[snapshotPersistence] Snapshot persistence is now handled inside the worker thread — this call is a no-op.',
    );
}
