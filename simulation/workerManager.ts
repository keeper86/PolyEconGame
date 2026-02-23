/**
 * simulation/workerManager.ts
 *
 * Manages the lifecycle of the simulation worker thread:
 *   - spawn on startup
 *   - crash detection + optional restart
 *   - graceful shutdown
 *   - typed message helpers
 *
 * Must only be imported on the server side.
 */

import path from "node:path";
import { Worker } from "node:worker_threads";

import type {
  InboundMessage,
  OutboundMessage,
} from "./worker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageHandler = (msg: OutboundMessage) => void;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let worker: Worker | null = null;
const messageHandlers = new Set<MessageHandler>();
let isShuttingDown = false;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveWorkerPath(): string {
  // Next.js compiles TypeScript files under .next/server; fall back to the
  // source path so ts-node / tsx / jest can run the worker directly.
  return path.resolve(process.cwd(), "simulation", "worker.ts");
}

function spawnWorker(): Worker {
  const workerPath = resolveWorkerPath();

  const w = new Worker(workerPath, {
    // Allow ts-node / tsx / @swc-node to transpile the worker on the fly.
    execArgv: ["--require", "tsx/cjs"],
    workerData: { tickIntervalMs: 1000 },
  });

  w.on("message", (msg: OutboundMessage) => {
    messageHandlers.forEach((h) => h(msg));
  });

  w.on("error", (err) => {
    console.error("[workerManager] Worker error:", err);
  });

  w.on("exit", (code) => {
    if (!isShuttingDown) {
      console.warn(
        `[workerManager] Worker exited unexpectedly (code ${code}). Restarting…`
      );
      worker = spawnWorker();
    } else {
      console.log("[workerManager] Worker shut down gracefully.");
    }
  });

  console.log("[workerManager] Simulation worker spawned.");
  return w;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the simulation worker.
 * Safe to call multiple times – only one worker is kept alive.
 */
export function startWorker(): void {
  if (worker) return;
  isShuttingDown = false;
  worker = spawnWorker();
}

/**
 * Send a typed message to the worker.
 */
export function sendToWorker(msg: InboundMessage): void {
  if (!worker) throw new Error("Worker is not running");
  worker.postMessage(msg);
}

/**
 * Register a listener for messages coming from the worker.
 * Returns an unsubscribe function.
 */
export function onWorkerMessage(handler: MessageHandler): () => void {
  messageHandlers.add(handler);
  return () => messageHandlers.delete(handler);
}

/**
 * Terminate the worker gracefully.
 */
export async function stopWorker(): Promise<void> {
  if (!worker) return;
  isShuttingDown = true;
  await worker.terminate();
  worker = null;
}
