/**
 * simulation/worker.ts
 *
 * Runs inside a dedicated worker_thread.
 * Owns the authoritative GameState and advances it on every tick.
 * Communicates with the main process via parentPort messages.
 */

import { parentPort, workerData } from "node:worker_threads";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GameState {
  tick: number;
}

export type InboundMessage = { type: "ping" };
export type OutboundMessage =
  | { type: "pong"; tick: number }
  | { type: "tick"; tick: number; elapsedMs: number };

// ---------------------------------------------------------------------------
// State  (private to this worker)
// ---------------------------------------------------------------------------

const TICK_INTERVAL_MS: number =
  typeof workerData?.tickIntervalMs === "number"
    ? workerData.tickIntervalMs
    : 1000;

const state: GameState = { tick: 0 };

// ---------------------------------------------------------------------------
// Tick loop (recursive setTimeout to avoid drift / overlap)
// ---------------------------------------------------------------------------

function scheduleTick(): void {
  setTimeout(() => {
    const start = Date.now();
    state.tick += 1;
    const elapsedMs = Date.now() - start;
    console.log(`[worker] Tick ${state.tick} completed in ${elapsedMs}ms`);

    const msg: OutboundMessage = { type: "tick", tick: state.tick, elapsedMs };
    parentPort?.postMessage(msg);

    scheduleTick();
  }, TICK_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

parentPort?.on("message", (msg: InboundMessage) => {
  if (msg.type === "ping") {
    const reply: OutboundMessage = { type: "pong", tick: state.tick };
    parentPort?.postMessage(reply);
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

console.log(
  `[worker] Simulation worker started (tick interval: ${TICK_INTERVAL_MS}ms)`
);
scheduleTick();
