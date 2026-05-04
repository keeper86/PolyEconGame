'use client';

import { cn } from '@/lib/utils';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import type { TickerEvent } from '@/server/controller/simulation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mapTickToDate } from '@/components/client/TickDisplay';

const MAX_LOCAL_EVENTS = 60;
const BASE_MS = 3000;
const MIN_MS = 200;

function categoryColor(category: string): string {
    switch (category) {
        case 'agentCreated':
        case 'facilityCompleted':
        case 'shipCompleted':
        case 'licenseAcquired':
            return 'green-500';
        case 'shipDispatched':
        case 'shipArrived':
            return 'blue-500';
        case 'agentBankrupt':
        case 'loanRollover':
            return 'red-500';
        case 'contractAccepted':
            return 'yellow-500';
        case 'priceSpike':
            return 'orange-500';
        case 'populationMilestone':
            return 'purple-500';
        default:
            return 'gray-500';
    }
}

const textColor = (category: string): string => `text-${categoryColor(category)}`;

export default function Footer() {
    const trpc = useTRPC();
    const [lastSeenId, setLastSeenId] = useState<number | undefined>(undefined);
    const [events, setEvents] = useState<TickerEvent[]>([]);
    const [currentEventId, setCurrentEventId] = useState<number | undefined>(undefined);
    const eventsRef = useRef<TickerEvent[]>([]);
    const currentEventIdRef = useRef<number | undefined>(undefined);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isPausedRef = useRef(false);

    const { data } = useSimulationQuery({
        ...trpc.simulation.getTickerEvents.queryOptions({ lastSeenId }),
    });

    // Schedule the next event advance. Delay shrinks as the pending queue grows.
    const scheduleNext = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        if (isPausedRef.current) {
            return;
        }
        const evs = eventsRef.current;
        const idx = evs.findIndex((e) => e.id === currentEventIdRef.current);
        const pending = evs.length - 1 - idx;
        if (pending <= 0) {
            return;
        }
        const delay = Math.max(MIN_MS, BASE_MS / pending);
        timeoutRef.current = setTimeout(() => {
            const evs = eventsRef.current;
            const idx = evs.findIndex((e) => e.id === currentEventIdRef.current);
            const nextEvent = evs[idx + 1];
            if (nextEvent) {
                currentEventIdRef.current = nextEvent.id;
                setCurrentEventId(nextEvent.id);
            }
            scheduleNext();
        }, delay);
    }, []);

    useEffect(() => {
        const newEvents = data?.tickerEvents;
        if (!newEvents || newEvents.length === 0) {
            return;
        }
        setEvents((prev) => [...prev, ...newEvents].slice(-MAX_LOCAL_EVENTS));
        setLastSeenId(Math.max(...newEvents.map((e) => e.id)));
    }, [data]);

    useEffect(() => {
        eventsRef.current = events;
        if (currentEventIdRef.current === undefined && events.length > 0) {
            const firstId = events[0]!.id;
            currentEventIdRef.current = firstId;
            setCurrentEventId(firstId);
        }
        scheduleNext();
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [events, scheduleNext]);

    const pause = useCallback(() => {
        isPausedRef.current = true;
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
    }, []);

    const resume = useCallback(() => {
        isPausedRef.current = false;
        scheduleNext();
    }, [scheduleNext]);

    const currentEvent = events.find((e) => e.id === currentEventId) ?? events[0];

    return (
        <footer className='shrink-0 w-full border-t border-border bg-background h-12'>
            {events.length === 0 ? (
                <div className='h-full flex items-center justify-center bg-muted/50'>
                    <span className='text-xs text-muted-foreground'>No events yet</span>
                </div>
            ) : (
                <div
                    className='relative h-full overflow-hidden bg-muted/50'
                    onMouseEnter={pause}
                    onMouseLeave={resume}
                    aria-label='Simulation event ticker'
                >
                    {currentEvent && (
                        <div
                            key={currentEvent.id}
                            className='flex items-center justify-center h-full animate-in fade-in duration-300'
                        >
                            <span className='inline-flex items-center gap-1.5 text-md'>
                                <span className={cn('text-muted-foreground', textColor(currentEvent.category))}>
                                    {mapTickToDate(currentEvent.tick)}
                                </span>
                                <span className='text-foreground/90'>{currentEvent.message}</span>
                            </span>
                        </div>
                    )}
                </div>
            )}
        </footer>
    );
}
