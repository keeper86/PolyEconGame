/**
 * src/app/api/ping/route.ts
 *
 * Test endpoint that sends a { type: "ping" } message to the simulation worker
 * and returns the worker's current tick in the response.
 *
 * Example:  GET /api/ping  →  { "type": "pong", "tick": 5 }
 */

import { NextResponse } from "next/server";
import { sendToWorker, onWorkerMessage } from "../../../../simulation/workerManager";
import type { OutboundMessage } from "../../../../simulation/worker";

const TIMEOUT_MS = 5000;

export async function GET(): Promise<NextResponse> {
  const pong = await new Promise<OutboundMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("Worker ping timed out"));
    }, TIMEOUT_MS);

    const unsubscribe = onWorkerMessage((msg) => {
      if (msg.type === "pong") {
        clearTimeout(timer);
        unsubscribe();
        resolve(msg);
      }
    });

    try {
      sendToWorker({ type: "ping" });
    } catch (err) {
      clearTimeout(timer);
      unsubscribe();
      reject(err);
    }
  });

  return NextResponse.json(pong);
}
