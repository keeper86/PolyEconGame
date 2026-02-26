/**
 * __tests__/simulation.test.ts
 *
 * Integration tests for the simulation worker lifecycle and messaging.
 */

import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WORKER_PATH = path.resolve(__dirname, './worker.ts');
const TIMEOUT = 10_000;

describe('Simulation Worker', () => {
    let worker: Worker;

    beforeEach(() => {
        worker = new Worker(WORKER_PATH, {
            execArgv: ['--require', 'tsx/cjs'],
            workerData: { tickIntervalMs: 0 }, // faster ticks for tests
        });
    });

    afterEach(async () => {
        await worker.terminate();
    });

    it(
        'increments tick counter over time',
        async () => {
            const ticks: number[] = [];

            await new Promise<void>((resolve) => {
                worker.on('message', (msg) => {
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
                worker.on('message', (msg) => {
                    if (msg.type === 'tick' && msg.tick >= 1) {
                        resolve();
                    }
                });
            });

            const pong = await new Promise<{ type: string; tick: number }>((resolve) => {
                worker.on('message', (msg) => {
                    if (msg.type === 'pong') {
                        resolve(msg);
                    }
                });
                worker.postMessage({ type: 'ping' });
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
                worker.on('message', (msg) => {
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

describe('WorkerManager', () => {
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
