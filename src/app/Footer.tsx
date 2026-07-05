'use client';

import { cn } from '@/lib/utils';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import type { TickerEvent } from '@/server/controller/simulation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { mapTickToDate } from '@/components/client/TickDisplay';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { useParams } from 'next/navigation';

const MAX_LOCAL_EVENTS = 60;
const GAP_PX = 48;
const BASE_SPEED_PX_PER_SEC = 80;

const RENDER_LAG_ESTIMATE_MS = 16;
const MAX_SPEED_PX_PER_SEC = 240;

type DisplayedEvent = { id: number; event: TickerEvent; duration: number; startX: number };

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
    const [isFullscreen, setIsFullscreen] = useState(false);
    const params = useParams();
    const planetId = typeof params?.planetId === 'string' ? params.planetId : undefined;

    const toggleFullscreen = useCallback(async () => {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
                setIsFullscreen(true);
            } else {
                await document.exitFullscreen();
                setIsFullscreen(false);
            }
        } catch (err) {
            console.error('Fullscreen failed:', err);
        }
    }, []);

    useEffect(() => {
        const handleChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleChange);
        return () => document.removeEventListener('fullscreenchange', handleChange);
    }, []);

    const trpc = useTRPC();
    const [lastSeenId, setLastSeenId] = useState<number | undefined>(undefined);
    const [events, setEvents] = useState<TickerEvent[]>([]);

    const { data } = useSimulationQuery({
        ...trpc.simulation.getTickerEvents.queryOptions({ lastSeenId }),
    });

    useEffect(() => {
        const newEvents =
            data?.tickerEvents.filter((e) => {
                if (planetId && e.planetId !== planetId) {
                    return false;
                }
                return e.category !== 'shipArrived' && e.category !== 'shipDispatched';
            }) ?? [];
        if (!newEvents || newEvents.length === 0) {
            return;
        }
        setEvents((prev) => [...prev, ...newEvents].slice(-MAX_LOCAL_EVENTS));
        setLastSeenId(Math.max(...newEvents.map((e) => e.id)));
    }, [data, planetId]);

    const isSmallScreen = useIsSmallScreen();

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

    const lastSpawnTimeRef = useRef<number>(-Infinity);
    const lastSpawnWidthRef = useRef<number>(0);
    const lastSpawnSpeedRef = useRef<number>(BASE_SPEED_PX_PER_SEC);
    const pauseStartRef = useRef<number>(0);
    const totalPausedDurationRef = useRef<number>(0);

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

    const measureTextWidth = useCallback((dateStr: string, message: string) => {
        const span = measureRef.current;
        if (!span) {
            return 100;
        }
        span.textContent = `${dateStr} ${message}`;

        return span.offsetWidth + 6;
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

    const computeSpeed = useCallback((pending: number) => {
        const factor = 0.15;
        return Math.min(MAX_SPEED_PX_PER_SEC, BASE_SPEED_PX_PER_SEC * (1 + (pending - 2) * factor));
    }, []);

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
        const width = measureTextWidth(dateStr, nextEvent.message);
        const containerWidth = containerWidthRef.current;
        const speed = speedRef.current;
        const prevSpeed = lastSpawnSpeedRef.current;

        const now = performance.now();
        const effectiveElapsed = now - lastSpawnTimeRef.current - totalPausedDurationRef.current;
        const distanceTraveled = (effectiveElapsed * prevSpeed) / 1000;
        const threshold =
            lastSpawnWidthRef.current +
            GAP_PX +
            containerWidth * (1 - Math.min(speed, prevSpeed) / Math.max(speed, prevSpeed));
        if (distanceTraveled < threshold) {
            return;
        }

        const duration = (containerWidth + width) / speed;

        lastSpawnTimeRef.current = now + RENDER_LAG_ESTIMATE_MS;
        lastSpawnWidthRef.current = width;
        lastSpawnSpeedRef.current = speed;
        totalPausedDurationRef.current = 0;
        lastDisplayedIdRef.current = nextEvent.id;

        setDisplayedEvents((prev) => [
            ...prev,
            { id: nextEvent.id, event: nextEvent, duration, startX: containerWidth },
        ]);
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
            <div className='flex h-full'>
                <div
                    ref={containerRef}
                    className='relative flex-1 min-w-0 overflow-hidden bg-muted/50'
                    style={{ '--ticker-play-state': isPaused ? 'paused' : 'running' } as React.CSSProperties}
                    aria-label='Simulation event ticker'
                    onMouseEnter={pause}
                    onMouseLeave={resume}
                >
                    {}
                    <span
                        ref={measureRef}
                        className='invisible absolute whitespace-nowrap text-md'
                        aria-hidden='true'
                    />

                    {}
                    <div
                        className={cn(
                            'pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-background to-transparent z-10',
                            isSmallScreen ? 'w-32' : 'w-64',
                        )}
                    />
                    <div
                        className={cn(
                            'pointer-events-none absolute inset-y-0 right-0 bg-gradient-to-l from-background to-transparent z-10',
                            isSmallScreen ? 'w-32' : 'w-64',
                        )}
                    />

                    {displayedEvents.map(({ id, event, duration, startX }) => (
                        <div
                            key={id}
                            className='ticker-item absolute top-0 left-0 h-full flex items-center whitespace-nowrap will-change-transform'
                            style={
                                {
                                    '--ticker-start': `${startX}px`,
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

                <button
                    onClick={toggleFullscreen}
                    className='shrink-0 h-full px-3 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border-l border-border z-20'
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                    {isFullscreen ? <Minimize className='h-4 w-4' /> : <Maximize className='h-4 w-4' />}
                </button>
            </div>
        </footer>
    );
}
