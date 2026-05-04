import { useCallback, useEffect, useRef, useState } from 'react';
import { useTRPC } from '@/lib/trpc';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import type { TickerEvent } from '@/server/controller/simulation';

interface UseEventQueueOptions {
    pollIntervalMs?: number;
}

interface UseEventQueueResult {
    /** All events fetched so far, in chronological order. */
    events: TickerEvent[];
    /** The most recent events (last 20) for the collapsed ticker. */
    recentEvents: TickerEvent[];
    /** Whether the initial fetch is still loading. */
    isLoading: boolean;
    /** Whether the last fetch failed. */
    isError: boolean;
    /** Manually reset the queue (e.g. on simulation restart). */
    reset: () => void;
}

export function useEventQueue(options: UseEventQueueOptions = {}): UseEventQueueResult {
    const { pollIntervalMs } = options;
    const trpc = useTRPC();

    const [events, setEvents] = useState<TickerEvent[]>([]);
    const [cursor, setCursor] = useState<number | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);

    // Ref to track the last tick for restart detection
    const lastTickRef = useRef<number | undefined>(undefined);

    const {
        data,
        isError: queryError,
        isFetching,
    } = useSimulationQuery({
        ...trpc.simulation.getTickerEvents.queryOptions({ lastSeenId: cursor }),
        refetchIntervalMs: pollIntervalMs,
    });

    useEffect(() => {
        if (isFetching) {
            return;
        }

        if (data) {
            const newEvents = data.tickerEvents;

            if (newEvents.length > 0) {
                setEvents((prev) => {
                    // Detect simulation restart: if the new events have a tick
                    // that is *earlier* than the last known tick, clear the queue.
                    const lastTick = lastTickRef.current;
                    if (lastTick !== undefined && newEvents.some((e) => e.tick < lastTick)) {
                        setCursor(undefined);
                        return newEvents;
                    }
                    return [...prev, ...newEvents];
                });

                // Update cursor to the highest ID seen
                const maxId = Math.max(...newEvents.map((e) => e.id ?? 0));
                if (maxId > (cursor ?? -1)) {
                    setCursor(maxId);
                }

                // Track the latest tick for restart detection
                const maxTick = Math.max(...newEvents.map((e) => e.tick));
                if (maxTick > (lastTickRef.current ?? -1)) {
                    lastTickRef.current = maxTick;
                }
            }

            setIsLoading(false);
            setIsError(false);
        }

        if (queryError) {
            setIsError(true);
        }
    }, [data, queryError, isFetching, cursor]);

    const reset = useCallback(() => {
        setCursor(undefined);
        lastTickRef.current = undefined;
        setEvents([]);
        setIsLoading(true);
        setIsError(false);
    }, []);

    const recentEvents = events.slice(-20);

    return { events, recentEvents, isLoading, isError, reset };
}
