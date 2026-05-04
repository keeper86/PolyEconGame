'use client';

import { cn } from '@/lib/utils';
import type { TickerEvent } from '@/server/controller/simulation';
import { useEffect, useRef, useState } from 'react';

interface SimulationEventTickerProps {
    events: TickerEvent[];
    className?: string;
}

const SCROLL_SPEED_PX_PER_S = 80;
const MAX_LOCAL_EVENTS = 60;

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

export function SimulationEventTicker({ events, className }: SimulationEventTickerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const scrollXRef = useRef<number | null>(null);
    const isPausedRef = useRef(false);
    const seenIdsRef = useRef(new Set<number>());
    const lastTimeRef = useRef<number | null>(null);

    const [localEvents, setLocalEvents] = useState<TickerEvent[]>([]);

    // Append genuinely new events without resetting the scroll animation
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

    // RAF-based scrolling — runs once on mount, never restarts
    useEffect(() => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            return;
        }

        let rafId: number;

        function tick(timestamp: number) {
            const container = containerRef.current;
            const content = contentRef.current;
            if (!container || !content) {
                rafId = requestAnimationFrame(tick);
                return;
            }

            // Initialise starting position to right edge of the container
            if (scrollXRef.current === null) {
                scrollXRef.current = container.clientWidth;
            }

            if (!isPausedRef.current) {
                const dt = lastTimeRef.current !== null ? (timestamp - lastTimeRef.current) / 1000 : 0;
                scrollXRef.current -= SCROLL_SPEED_PX_PER_S * dt;

                content.style.transform = `translateX(${scrollXRef.current}px)`;
            }

            lastTimeRef.current = timestamp;
            rafId = requestAnimationFrame(tick);
        }

        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, []);

    return (
        <div
            ref={containerRef}
            className={cn(
                'relative h-12 overflow-hidden rounded-md border bg-muted/50',
                'hover:bg-muted/80 transition-colors',
                className,
            )}
            onMouseEnter={() => {
                isPausedRef.current = true;
            }}
            onMouseLeave={() => {
                isPausedRef.current = false;
            }}
            role='button'
            tabIndex={0}
            aria-label='Simulation event ticker. Click to expand for full log.'
            aria-expanded={false}
        >
            {/* Gradient fade on edges */}
            <div className='pointer-events-none absolute inset-y-0 left-0 w-64 bg-gradient-to-r from-background to-transparent z-10' />
            <div className='pointer-events-none absolute inset-y-0 right-0 w-64 bg-gradient-to-l from-background to-transparent z-10' />

            <div
                ref={contentRef}
                className='flex items-center h-full gap-4 whitespace-nowrap px-2'
                style={{ willChange: 'transform' }}
            >
                {localEvents.map((event) => (
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
