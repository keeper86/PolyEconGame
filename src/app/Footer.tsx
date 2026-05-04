'use client';

import { cn } from '@/lib/utils';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import type { TickerEvent } from '@/server/controller/simulation';
import { useEffect, useMemo, useRef, useState } from 'react';

const MAX_LOCAL_EVENTS = 60;
const AUTO_ADVANCE_MS = 3000;

function categoryColor(category: string): string {
    switch (category) {
        case 'agentCreated':
        case 'facilityCompleted':
        case 'shipCompleted':
        case 'licenseAcquired':
            return 'bg-green-500';
        case 'shipDispatched':
        case 'shipArrived':
            return 'bg-blue-500';
        case 'agentBankrupt':
        case 'loanRollover':
            return 'bg-red-500';
        case 'contractAccepted':
            return 'bg-yellow-500';
        case 'priceSpike':
            return 'bg-orange-500';
        case 'populationMilestone':
            return 'bg-purple-500';
        default:
            return 'bg-gray-500';
    }
}

export default function Footer() {
    const trpc = useTRPC();
    const [lastSeenId, setLastSeenId] = useState<number | undefined>(undefined);
    const [events, setEvents] = useState<TickerEvent[]>([]);
    const [currentId, setCurrentId] = useState<number | undefined>(undefined);
    const eventsRef = useRef<TickerEvent[]>([]);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isPausedRef = useRef(false);

    const { data } = useSimulationQuery({
        ...trpc.simulation.getTickerEvents.queryOptions({ lastSeenId }),
        refetchIntervalMs: 3000,
    });

    useEffect(() => {
        const newEvents = data?.tickerEvents;
        if (!newEvents || newEvents.length === 0) {
            return;
        }
        setEvents((prev) => {
            const updated = [...prev, ...newEvents].slice(-MAX_LOCAL_EVENTS);
            eventsRef.current = updated;
            return updated;
        });
        setCurrentId((id) => id ?? newEvents[0]?.id);
        setLastSeenId(Math.max(...newEvents.map((e) => e.id)));
    }, [data]);

    const totalEvents = events.length;

    useEffect(() => {
        eventsRef.current = events;
    }, [events]);

    const startInterval = useMemo(
        () => () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            if (totalEvents <= 0 || isPausedRef.current) {
                return;
            }
            intervalRef.current = setInterval(() => {
                setCurrentId((id) => {
                    const evs = eventsRef.current;
                    if (evs.length === 0) {
                        return id;
                    }
                    const idx = evs.findIndex((e) => e.id === id);
                    return evs[(idx + 1) % evs.length]?.id ?? id;
                });
            }, AUTO_ADVANCE_MS);
        },
        [totalEvents],
    );

    useEffect(() => {
        startInterval();
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [totalEvents, currentId, startInterval]);

    const pause = () => {
        isPausedRef.current = true;
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
    };

    const resume = () => {
        isPausedRef.current = false;
        startInterval();
    };

    const currentIdx = events.findIndex((e) => e.id === currentId);
    const displayIdx = currentIdx >= 0 ? currentIdx : 0;

    return (
        <footer className='shrink-0 w-full border-t border-border bg-background h-12'>
            {totalEvents === 0 ? (
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
                    <div
                        className='flex flex-col h-full'
                        style={{
                            transform: `translateY(calc(-${displayIdx - 1} * (100% / 3)))`,
                            transition: 'transform 0.3s ease',
                        }}
                    >
                        {events.map((event, idx) => {
                            const distance = Math.abs(idx - displayIdx - 1);
                            const opacity = distance === 0 ? 1 : distance === 1 ? 0.4 : 0;
                            return (
                                <div
                                    key={event.id}
                                    className='flex items-center justify-center flex-none'
                                    style={{ height: `${100 / 3}%`, opacity, transition: 'opacity 0.3s' }}
                                >
                                    <span className='inline-flex items-center gap-1.5 text-xs'>
                                        <span
                                            className={cn(
                                                'inline-block w-1.5 h-1.5 rounded-full shrink-0',
                                                categoryColor(event.category),
                                            )}
                                        />
                                        <span className='text-muted-foreground font-mono'>T{event.tick}</span>
                                        <span className='text-foreground/90'>{event.message}</span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </footer>
    );
}
