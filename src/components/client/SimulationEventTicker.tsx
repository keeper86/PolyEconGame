'use client';

import { cn } from '@/lib/utils';
import type { TickerEvent } from '@/server/controller/simulation';
import { useEffect, useRef, useState } from 'react';

interface SimulationEventTicker2Props {
    events: TickerEvent[];
    className?: string;
}

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

export function SimulationEventTicker({ events, className }: SimulationEventTicker2Props) {
    const [localEvents, setLocalEvents] = useState<TickerEvent[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const seenIdsRef = useRef(new Set<number>());
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isPausedRef = useRef(false);

    // Deduplicate and cap incoming events
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

    const totalEvents = localEvents.length;

    // Clamp currentIndex when events list shrinks
    useEffect(() => {
        if (totalEvents > 0 && currentIndex >= totalEvents) {
            setCurrentIndex(0);
        }
    }, [totalEvents, currentIndex]);

    // Auto‑advance timer
    useEffect(() => {
        if (totalEvents === 0 || isPausedRef.current) {
            return;
        }

        const advance = () => setCurrentIndex((prev) => (prev + 1) % totalEvents);
        intervalRef.current = setInterval(advance, AUTO_ADVANCE_MS);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [totalEvents]);

    const pause = () => {
        isPausedRef.current = true;
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
    };

    const resume = () => {
        isPausedRef.current = false;
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
        if (totalEvents > 0) {
            intervalRef.current = setInterval(
                () => setCurrentIndex((prev) => (prev + 1) % totalEvents),
                AUTO_ADVANCE_MS,
            );
        }
    };

    // No events state
    if (totalEvents === 0) {
        return (
            <div
                className={cn(
                    'relative h-12 rounded-md border bg-muted/50 flex items-center justify-center',
                    className,
                )}
            >
                <span className='text-xs text-muted-foreground'>No events yet</span>
            </div>
        );
    }

    const currentEvent = localEvents[currentIndex];

    return (
        <div
            className={cn('relative h-12 overflow-hidden rounded-md border bg-muted/50', className)}
            onMouseEnter={pause}
            onMouseLeave={resume}
            aria-label='Simulation event ticker'
        >
            {/* Single event with a subtle fade transition */}
            <div className='flex items-center justify-center h-full'>
                <div key={currentEvent.id} className='inline-flex items-center gap-1.5 text-xs animate-fade-in'>
                    <span
                        className={cn(
                            'inline-block w-1.5 h-1.5 rounded-full shrink-0',
                            categoryColor(currentEvent.category),
                        )}
                    />
                    <span className='text-muted-foreground font-mono'>T{currentEvent.tick}</span>
                    <span className='text-foreground/90'>{currentEvent.message}</span>
                </div>
            </div>
        </div>
    );
}
