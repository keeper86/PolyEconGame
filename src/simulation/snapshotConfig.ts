/**
 * simulation/snapshotConfig.ts
 *
 * Configuration for the sparse cold snapshot system.
 * All values can be overridden via environment variables.
 */

/** Number of ticks between cold snapshots (default: 360 = one in-game year). */
export const SNAPSHOT_INTERVAL_TICKS: number = Number(process.env.SNAPSHOT_INTERVAL_TICKS) || 360;
/** Maximum number of snapshots to retain in the database.  0 = unlimited. */
export const SNAPSHOT_MAX_RETAINED: number = Number(process.env.SNAPSHOT_MAX_RETAINED) || 50;
