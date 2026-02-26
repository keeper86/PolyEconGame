/**
 * snapshotPersistence.ts
 *
 * Registers a listener on the simulation worker message bus that persists
 * each GameState snapshot to the database.  This keeps the SSE stream
 * working unchanged while also populating the snapshot tables so tRPC
 * endpoints can return component-specific data.
 */

import { onWorkerMessage } from './workerManager';
import { saveGameStateSnapshot } from '../server/snapshotRepository';
import { db } from '../server/db';
import type { OutboundMessage } from './worker';

/**
 * Register a persistent listener that saves simulation state to the DB on
 * every tick.  Call this once from the Next.js `register()` instrumentation
 * hook so snapshots are available for tRPC queries.
 *
 * Errors during persistence are logged but do not crash the server.
 */
export function registerSnapshotPersistence(): void {
    onWorkerMessage(async (msg: OutboundMessage) => {
        if (msg.type !== 'state') {
            return;
        }

        try {
            await saveGameStateSnapshot(db, msg.state);
        } catch (err) {
            console.error('[snapshotPersistence] Failed to save snapshot for tick', msg.state.tick, err);
        }
    });
}
