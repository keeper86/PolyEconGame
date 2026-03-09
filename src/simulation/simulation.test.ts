/**
 * __tests__/simulation.test.ts
 *
 * Integration tests for the simulation worker lifecycle and messaging.
 */

import path from 'node:path';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { Piscina } from 'piscina';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WORKER_PATH = path.resolve(__dirname, './worker.ts');
const TIMEOUT = 10_000;

describe.skip('Simulation Worker', () => {
    let pool: Piscina;
    let port1: MessagePort;

    beforeEach(() => {
        pool = new Piscina({
            filename: WORKER_PATH,
            minThreads: 1,
            maxThreads: 1,
            idleTimeout: Infinity,
            atomics: 'disabled',
            workerData: { tickIntervalMs: 1000 }, // faster ticks for tests
            execArgv: ['--require', 'tsx/cjs'],
        });

        // Create a dedicated MessageChannel for custom messages, just like
        // workerManager does.  port2 goes to the worker, port1 stays here.
        const channel = new MessageChannel();
        port1 = channel.port1;

        // Start the simulation task, transferring port2 to the worker.
        pool.run({ command: 'start', port: channel.port2 }, { transferList: [channel.port2] }).catch(() => {
            /* terminated */
        });
    });

    afterEach(async () => {
        port1.close();
        await pool.destroy();
    });

    it(
        'increments tick counter over time',
        async () => {
            const ticks: number[] = [];

            await new Promise<void>((resolve) => {
                port1.on('message', (msg) => {
                    if (msg.type === 'tick') {
                        ticks.push(msg.tick);
                        if (ticks.length >= 3) {
                            resolve();
                        }
                    }
                });
            });

            expect(ticks).toHaveLength(3);
            expect(ticks[0]).toBe(1);
            expect(ticks[1]).toBe(2);
            expect(ticks[2]).toBe(3);
        },
        TIMEOUT,
    );

    it(
        'responds to ping with current tick',
        async () => {
            // Wait for at least one tick so tick > 0
            await new Promise<void>((resolve) => {
                port1.on('message', (msg) => {
                    if (msg.type === 'tick' && msg.tick >= 1) {
                        resolve();
                    }
                });
            });

            // Remove previous listener so it doesn't interfere
            port1.removeAllListeners('message');

            const pong = await new Promise<{ type: string; tick: number }>((resolve) => {
                port1.on('message', (msg) => {
                    if (msg.type === 'pong') {
                        resolve(msg);
                    }
                });
                port1.postMessage({ type: 'ping' });
            });

            expect(pong.type).toBe('pong');
            expect(pong.tick).toBeGreaterThanOrEqual(1);
        },
        TIMEOUT,
    );

    it(
        'includes elapsedMs in tick messages',
        async () => {
            const tickMsg = await new Promise<{ type: string; tick: number; elapsedMs: number }>((resolve) => {
                port1.on('message', (msg) => {
                    if (msg.type === 'tick') {
                        resolve(msg);
                    }
                });
            });

            expect(tickMsg.elapsedMs).toBeGreaterThanOrEqual(0);
        },
        TIMEOUT,
    );
});

describe.skip('WorkerManager', () => {
    it(
        'startWorker spawns exactly one worker and stopWorker terminates it',
        async () => {
            const { startWorker, stopWorker, onWorkerMessage } = await import('./workerManager');

            // Reset module state by re-requiring (jest isolates modules per test file)
            startWorker();
            startWorker(); // second call should be a no-op

            const tickReceived = await new Promise<boolean>((resolve) => {
                const unsub = onWorkerMessage((msg: unknown) => {
                    if ((msg as { type: string }).type === 'tick') {
                        unsub();
                        resolve(true);
                    }
                });
            });

            expect(tickReceived).toBe(true);
            await stopWorker();
        },
        TIMEOUT,
    );
});
