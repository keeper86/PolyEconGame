import { sendToWorker, onWorkerMessage } from './manager';
import type { InboundMessage, OutboundMessage } from './messages';
import type { CommandSpec } from './commandSpec';
import { getPending } from './pendingRequests';
import { domainErrorFromPacket } from '../../server/domainError';
import { logger } from '../../server/logger';

const GLOBAL_KEY_LOG_LISTENER = Symbol.for('__polyecon_workerLog_listener__');

const g = globalThis as unknown as {
    [GLOBAL_KEY_LOG_LISTENER]?: boolean;
};

const DEFAULT_TIMEOUT_MS = 5_000;

const failureToError = (msg: OutboundMessage & { requestId: string }): Error =>
    'error' in msg ? domainErrorFromPacket(msg.error) : new Error((msg as { reason: string }).reason);

function ensureLogListener(): void {
    if (g[GLOBAL_KEY_LOG_LISTENER]) {
        return;
    }
    g[GLOBAL_KEY_LOG_LISTENER] = true;

    onWorkerMessage((msg: OutboundMessage) => {
        if (msg.type !== 'workerLog') {
            return;
        }
        if (msg.level === 'error') {
            logger.error(msg.message);
        } else if (msg.level === 'warn') {
            logger.warn(msg.message);
        } else {
            logger.info(msg.message);
        }
    });
}

ensureLogListener();

export function sendCommandSpec<
    TInbound extends InboundMessage & { requestId: string },
    TSuccess extends OutboundMessage & { requestId: string },
    TFailure extends OutboundMessage & { requestId: string },
    TResult,
>(
    message: TInbound,
    spec: CommandSpec<TInbound, TSuccess, TFailure, TResult>,
    timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ result: TResult; processedAtTick: number }> {
    const { requestId } = message;

    return new Promise<{ result: TResult; processedAtTick: number }>((resolve, reject) => {
        const unsubscribe = onWorkerMessage((msg: OutboundMessage) => {
            if (msg.type !== spec.successType && msg.type !== spec.failureType) {
                return;
            }
            if ((msg as { requestId?: string }).requestId !== requestId) {
                return;
            }

            unsubscribe();
            const entry = getPending().get(requestId);
            if (!entry) {
                return;
            }
            getPending().delete(requestId);
            clearTimeout(entry.timer);

            if (msg.type === spec.failureType) {
                entry.reject(failureToError(msg as TFailure));
            } else {
                const successMsg = msg as TSuccess & { processedAtTick: number };
                entry.resolve({
                    result: spec.extract(successMsg),
                    processedAtTick: successMsg.processedAtTick,
                });
            }
        });

        const timer = setTimeout(() => {
            unsubscribe();
            getPending().delete(requestId);
            reject(new Error(`Worker command '${message.type}' timed out after ${timeoutMs}ms (id=${requestId})`));
        }, timeoutMs);

        getPending().set(requestId, {
            resolve: resolve as (value: unknown) => void,
            reject,
            timer,
        });

        try {
            sendToWorker(message as never);
        } catch (err) {
            unsubscribe();
            getPending().delete(requestId);
            clearTimeout(timer);
            reject(err);
        }
    });
}
