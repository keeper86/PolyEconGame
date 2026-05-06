'use client';

import { cn } from '@/lib/utils';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import type { TickerEvent } from '@/server/controller/simulation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { mapTickToDate } from '@/components/client/TickDisplay';

/* ---------- constants ---------- */
const MAX_LOCAL_EVENTS = 60;
const GAP_PX = 24; // minimum horizontal gap between events (steric interaction)
const BASE_SPEED_PX_PER_SEC = 80;
const MIN_SPEED_PX_PER_SEC = 30;
const MAX_SPEED_PX_PER_SEC = 500;

type DisplayedEvent = { id: number; event: TickerEvent; duration: number };

/* ---------- helpers ---------- */
function textColor(category: string): string {
    switch (category) {
        case 'agentCreated':
        case 'facilityCompleted':
        case 'shipCompleted':
        case 'licenseAcquired':
            return 'text-green-500';
        case 'shipDispatched':
        case 'shipArrived':
            return 'text-blue-500';
        case 'agentBankrupt':
        case 'loanRollover':
            return 'text-red-500';
        case 'contractAccepted':
            return 'text-yellow-500';
        case 'priceSpike':
            return 'text-orange-500';
        case 'populationMilestone':
            return 'text-purple-500';
        default:
            return 'text-gray-500';
    }
}

export default function Footer() {
    const trpc = useTRPC();
    const [lastSeenId, setLastSeenId] = useState<number | undefined>(undefined);
    const [events, setEvents] = useState<TickerEvent[]>([]); // master list (latest 60)

    const { data } = useSimulationQuery({
        ...trpc.simulation.getTickerEvents.queryOptions({ lastSeenId }),
    });

    // Merge server events
    useEffect(() => {
        const newEvents = data?.tickerEvents;
        if (!newEvents || newEvents.length === 0) {
            return;
        }
        setEvents((prev) => [...prev, ...newEvents].slice(-MAX_LOCAL_EVENTS));
        setLastSeenId(Math.max(...newEvents.map((e) => e.id)));
    }, [data]);

    /* ---- DOM refs ---- */
    const containerRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLSpanElement>(null);
    const eventsRef = useRef<TickerEvent[]>(events);
    useEffect(() => {
        eventsRef.current = events;
    }, [events]);

    const [displayedEvents, setDisplayedEvents] = useState<DisplayedEvent[]>([]);
    const [isPaused, setIsPaused] = useState(false);
    const isPausedRef = useRef(false);

    const lastDisplayedIdRef = useRef<number | undefined>(undefined);
    const containerWidthRef = useRef<number>(0);
    const speedRef = useRef<number>(BASE_SPEED_PX_PER_SEC);

    // Steric state: time-based, accounts for paused duration since last spawn
    const lastSpawnTimeRef = useRef<number>(-Infinity);
    const lastSpawnWidthRef = useRef<number>(0);
    const pauseStartRef = useRef<number>(0);
    const totalPausedDurationRef = useRef<number>(0); // ms paused since last spawn

    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) {
            return;
        }

        const updateWidth = () => {
            containerWidthRef.current = el.clientWidth;
        };

        updateWidth();
        const observer = new ResizeObserver(updateWidth);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const measureTextWidth = useCallback((text: string) => {
        const span = measureRef.current;
        if (!span) {
            return 100;
        }
        span.textContent = text;
        return span.offsetWidth;
    }, []);

    const findNextEvent = useCallback((): TickerEvent | undefined => {
        const all = eventsRef.current;
        if (all.length === 0) {
            return undefined;
        }
        if (lastDisplayedIdRef.current === undefined) {
            return all[0];
        }
        return all.find((e) => e.id > lastDisplayedIdRef.current!);
    }, []);

    /* ---- speed = f(pending) ---- */
    const computeSpeed = useCallback((pending: number) => {
        const factor = 0.15;
        return Math.min(
            MAX_SPEED_PX_PER_SEC,
            Math.max(MIN_SPEED_PX_PER_SEC, BASE_SPEED_PX_PER_SEC * (1 + pending * factor)),
        );
    }, []);

    /* ---- spawn a new event if space allows ---- */
    const trySpawn = useCallback(() => {
        if (isPausedRef.current) {
            return;
        }

        const all = eventsRef.current;
        const pending =
            lastDisplayedIdRef.current === undefined
                ? all.length
                : all.filter((e) => e.id > lastDisplayedIdRef.current!).length;

        if (pending === 0) {
            return;
        }

        speedRef.current = computeSpeed(pending);

        const nextEvent = findNextEvent();
        if (!nextEvent) {
            return;
        }

        const dateStr = mapTickToDate(nextEvent.tick);
        const fullText = `${dateStr} ${nextEvent.message}`;
        const width = measureTextWidth(fullText);
        const containerWidth = containerWidthRef.current;
        const speed = speedRef.current;

        // Steric check: approximate right-edge of last-spawned element using elapsed time
        // minus any time spent paused since that spawn.
        const now = performance.now();
        const effectiveElapsed = now - lastSpawnTimeRef.current - totalPausedDurationRef.current;
        const distanceTraveled = (effectiveElapsed * speed) / 1000;
        if (distanceTraveled < lastSpawnWidthRef.current + GAP_PX) {
            return;
        }

        const duration = (containerWidth + width) / speed;

        lastSpawnTimeRef.current = now;
        lastSpawnWidthRef.current = width;
        totalPausedDurationRef.current = 0; // reset: track pauses from this spawn onward
        lastDisplayedIdRef.current = nextEvent.id;

        setDisplayedEvents((prev) => [...prev, { id: nextEvent.id, event: nextEvent, duration }]);
    }, [computeSpeed, findNextEvent, measureTextWidth]);

    useEffect(() => {
        const intervalId = setInterval(trySpawn, 50);
        return () => clearInterval(intervalId);
    }, [trySpawn]);

    const pause = useCallback(() => {
        if (!isPausedRef.current) {
            pauseStartRef.current = performance.now();
        }
        isPausedRef.current = true;
        setIsPaused(true);
    }, []);

    const resume = useCallback(() => {
        if (isPausedRef.current) {
            totalPausedDurationRef.current += performance.now() - pauseStartRef.current;
        }
        isPausedRef.current = false;
        setIsPaused(false);
    }, []);

    return (
        <footer className='shrink-0 w-full border-t border-border bg-background h-12'>
            <div
                ref={containerRef}
                className='relative h-full overflow-hidden bg-muted/50'
                style={{ '--ticker-play-state': isPaused ? 'paused' : 'running' } as React.CSSProperties}
                onMouseEnter={pause}
                onMouseLeave={resume}
                aria-label='Simulation event ticker'
            >
                {/* hidden measurement span – same styling as ticker items */}
                <span ref={measureRef} className='invisible absolute whitespace-nowrap text-md' aria-hidden='true' />

                {/* Gradient fade on edges */}
                <div className='pointer-events-none absolute inset-y-0 left-0 w-64 bg-gradient-to-r from-background to-transparent z-10' />
                <div className='pointer-events-none absolute inset-y-0 right-0 w-64 bg-gradient-to-l from-background to-transparent z-10' />

                {displayedEvents.map(({ id, event, duration }) => (
                    <div
                        key={id}
                        className='ticker-item absolute top-0 left-0 h-full flex items-center whitespace-nowrap will-change-transform'
                        style={
                            {
                                '--ticker-start': `${containerWidthRef.current}px`,
                                'animationDuration': `${duration}s`,
                            } as React.CSSProperties
                        }
                        onAnimationEnd={() => setDisplayedEvents((prev) => prev.filter((e) => e.id !== id))}
                    >
                        <span className='inline-flex items-center gap-1.5 text-md select-none'>
                            <span className={cn('text-muted-foreground text-xs', textColor(event.category))}>
                                {mapTickToDate(event.tick)}
                            </span>
                            <span className='text-foreground/90'>{event.message}</span>
                        </span>
                    </div>
                ))}
            </div>
        </footer>
    );
}
