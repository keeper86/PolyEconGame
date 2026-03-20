import { NextResponse } from 'next/server';
import type { OutboundMessage } from '../../../simulation/worker';
import { onWorkerMessage, sendToWorker } from '@/simulation/workerClient/manager';

const TIMEOUT_MS = 5000;

export async function GET(): Promise<NextResponse> {
    const pong = await new Promise<OutboundMessage>((resolve, reject) => {
        const timer = setTimeout(() => {
            unsubscribe();
            reject(new Error('Worker ping timed out'));
        }, TIMEOUT_MS);

        const unsubscribe = onWorkerMessage((msg) => {
            if (msg.type === 'pong') {
                clearTimeout(timer);
                unsubscribe();
                resolve(msg);
            }
        });

        try {
            sendToWorker({ type: 'ping' });
        } catch (err) {
            clearTimeout(timer);
            unsubscribe();
            reject(err);
        }
    });

    return NextResponse.json(pong);
}
