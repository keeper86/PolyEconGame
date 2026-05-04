'use client';

import { cn } from '@/lib/utils';
import type { TickerEvent } from '@/server/controller/simulation';
import { useState } from 'react';

interface SimulationEventTickerProps {
    events: TickerEvent[];
    className?: string;
}

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

// ~3 s per event, minimum 20 s for short lists
function scrollDuration(eventCount: number): number {
    return Math.max(eventCount * 5, 30);
}

export function SimulationEventTicker({ events, className }: SimulationEventTickerProps) {
    const [isPaused, setIsPaused] = useState(false);

    const lastEventId = events.length > 0 ? events[events.length - 1].id : undefined;
    const duration = scrollDuration(events.length);

    return (
        <div
            className={cn(
                'relative h-12 overflow-hidden rounded-md border bg-muted/50',
                'hover:bg-muted/80 transition-colors',
                className,
            )}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            role='button'
            tabIndex={0}
            aria-label='Simulation event ticker. Click to expand for full log.'
            aria-expanded={false}
        >
            {/* Gradient fade on edges */}
            <div className='pointer-events-none absolute inset-y-0 left-0 w-64 bg-gradient-to-r from-background to-transparent z-10' />
            <div className='pointer-events-none absolute inset-y-0 right-0 w-64 bg-gradient-to-l from-background to-transparent z-10' />

            {/* key resets the CSS animation whenever a new batch of events arrives */}
            <div
                key={lastEventId}
                className='ticker-scroll flex items-center h-full gap-4 whitespace-nowrap px-2'
                style={{
                    animation: `ticker-scroll ${duration}s linear infinite`,
                    animationPlayState: isPaused ? 'paused' : 'running',
                    willChange: 'transform',
                }}
            >
                {events.map((event) => (
                    <span key={event.id} className='inline-flex items-center gap-1.5 text-xs shrink-0'>
                        <span
                            className={cn(
                                'inline-block w-1.5 h-1.5 rounded-full shrink-0',
                                categoryColor(event.category),
                            )}
                        />
                        <span className='text-muted-foreground font-mono'>T{event.tick}</span>
                        <span className='text-foreground/90'>{event.message}</span>
                    </span>
                ))}
            </div>
        </div>
    );
}
