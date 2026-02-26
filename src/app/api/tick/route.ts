/**
 * Simple Server-Sent Events endpoint that forwards `tick` messages from the
 * simulation worker to any connected clients. Each connected client gets its
 * own subscription and will receive a JSON-encoded message for every tick.
 */

import { startWorker, onWorkerMessage } from '../../../simulation/workerManager';
import type { OutboundMessage } from '../../../simulation/worker';

export async function GET(): Promise<Response> {
    // Ensure the worker is running.
    startWorker();

    let unsubscribe: (() => void) | undefined;

    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();
            const handler = (msg: OutboundMessage) => {
                // Forward all outbound messages from the worker to connected clients.
                const data = `data: ${JSON.stringify(msg)}\n\n`;
                controller.enqueue(encoder.encode(data));
            };

            unsubscribe = onWorkerMessage(handler);
        },
        cancel() {
            if (unsubscribe) {
                unsubscribe();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
        },
    });
}
