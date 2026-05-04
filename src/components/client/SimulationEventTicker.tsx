'use client';

import { cn } from '@/lib/utils';
import type { TickerEvent } from '@/server/controller/simulation';
import { useEffect, useRef, useState } from 'react';

interface SimulationEventTicker2Props {
    events: TickerEvent[];
    className?: string;
}

const MAX_LOCAL_EVENTS = 60;
const VISIBLE_ROWS = 3;
const ROW_HEIGHT = 32; // px
const ADVANCE_INTERVAL_MS = 1800;

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

export function SimulationEventTicker({ events, className }: SimulationEventTicker2Props) {
    const [localEvents, setLocalEvents] = useState<TickerEvent[]>([]);
    const [index, setIndex] = useState(0);

    const seenIdsRef = useRef(new Set<number>());
    const isPausedRef = useRef(false);

    // Incremental ingestion (same logic as before)
    useEffect(() => {
        if (events.length === 0) {
            return;
        }

        const newEvents = events.filter((e) => e.id !== undefined && !seenIdsRef.current.has(e.id!));

        if (newEvents.length === 0) {
            return;
        }

        newEvents.forEach((e) => seenIdsRef.current.add(e.id!));

        setLocalEvents((prev) => [...prev, ...newEvents].slice(-MAX_LOCAL_EVENTS));
    }, [events]);

    // Auto-advance
    useEffect(() => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            return;
        }

        const interval = setInterval(() => {
            if (isPausedRef.current) {
                return;
            }

            setIndex((prev) => {
                if (localEvents.length <= VISIBLE_ROWS) {
                    return 0;
                }
                return (prev + 1) % localEvents.length;
            });
        }, ADVANCE_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [localEvents.length]);

    // Compute visible slice (wrap-around)
    const visibleEvents = [];
    for (let i = 0; i < Math.min(VISIBLE_ROWS, localEvents.length); i++) {
        visibleEvents.push(localEvents[(index + i) % localEvents.length]);
    }

    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-md border bg-muted/50',
                'hover:bg-muted/80 transition-colors',
                className,
            )}
            style={{ height: VISIBLE_ROWS * ROW_HEIGHT }}
            onMouseEnter={() => (isPausedRef.current = true)}
            onMouseLeave={() => (isPausedRef.current = false)}
            aria-label='Simulation event ticker'
        >
            {/* Fade edges */}
            <div className='pointer-events-none absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-background to-transparent z-10' />
            <div className='pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent z-10' />

            <div
                className='flex flex-col transition-transform duration-500 ease-out'
                style={{
                    transform: `translateY(0px)`,
                }}
            >
                {visibleEvents.map((event) => (
                    <div key={event.id} className='flex items-center gap-2 px-2 text-xs' style={{ height: ROW_HEIGHT }}>
                        <span
                            className={cn(
                                'inline-block w-1.5 h-1.5 rounded-full shrink-0',
                                categoryColor(event.category),
                            )}
                        />
                        <span className='text-muted-foreground font-mono'>T{event.tick}</span>
                        <span className='text-foreground/90 truncate'>{event.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
