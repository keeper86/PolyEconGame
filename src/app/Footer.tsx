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

    const [displayedEvents, setDisplayedEvents] = useState<{ id: number; event: TickerEvent }[]>([]);

    const positionsMapRef = useRef<Map<number, { x: number; width: number; element: HTMLDivElement | null }>>(
        new Map(),
    );
    const lastDisplayedIdRef = useRef<number | undefined>(undefined);
    const containerWidthRef = useRef<number>(0);
    const speedRef = useRef<number>(BASE_SPEED_PX_PER_SEC);
    const isPausedRef = useRef(false);
    const animFrameRef = useRef<number>(0);
    const lastTimestampRef = useRef<number>(0);
    const spawnLockRef = useRef(false);

    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) {
            return;
        }

        const updateWidth = () => {
            containerWidthRef.current = el.clientWidth;
        };

        updateWidth(); // initial measurement (synchronous)
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
        if (spawnLockRef.current) {
            return;
        }
        const nextEvent = findNextEvent();
        if (!nextEvent) {
            return;
        }

        const dateStr = mapTickToDate(nextEvent.tick);
        const fullText = `${dateStr} ${nextEvent.message}`;
        const width = measureTextWidth(fullText);
        const containerWidth = containerWidthRef.current;
        const gap = GAP_PX;

        const positions = positionsMapRef.current;
        let canSpawn = true;

        // steric interaction: enough room at the right edge for the new event?
        if (positions.size > 0) {
            const rightMost = Math.max(...Array.from(positions.values(), (p) => p.x));
            const rightMostWidth = Array.from(positions.values()).find((p) => p.x === rightMost)?.width ?? 0;
            if (rightMost + rightMostWidth + gap > containerWidth) {
                canSpawn = false;
            }
        }

        if (canSpawn) {
            const id = nextEvent.id;
            const startX = containerWidth; // just outside the right edge
            positions.set(id, { x: startX, width, element: null });
            lastDisplayedIdRef.current = id;
            spawnLockRef.current = true; // released when element mounts
            setDisplayedEvents((prev) => [...prev, { id, event: nextEvent }]);
        }
    }, [findNextEvent, measureTextWidth]);

    /* ---- registerElement – set initial transform and unlock spawning ---- */
    const registerElement = useCallback((id: number, el: HTMLDivElement | null) => {
        if (!el) {
            return;
        }
        const pos = positionsMapRef.current.get(id);
        if (!pos) {
            return;
        }
        pos.element = el;
        el.style.transform = `translateX(${pos.x}px)`;
        spawnLockRef.current = false;
    }, []);

    /* ---- animation loop ---- */
    const animationLoop = useCallback(() => {
        animFrameRef.current = requestAnimationFrame(animationLoop);

        if (isPausedRef.current) {
            lastTimestampRef.current = 0; // reset delta
            return;
        }

        const now = performance.now();
        if (lastTimestampRef.current === 0) {
            lastTimestampRef.current = now;
            return;
        }
        const deltaMs = now - lastTimestampRef.current;
        lastTimestampRef.current = now;

        const pending =
            lastDisplayedIdRef.current === undefined
                ? eventsRef.current.length
                : eventsRef.current.filter((e) => e.id > lastDisplayedIdRef.current!).length;
        speedRef.current = computeSpeed(pending);

        const pxPerMs = speedRef.current / 1000;
        const toRemove: number[] = [];

        positionsMapRef.current.forEach((pos, id) => {
            pos.x -= pxPerMs * deltaMs;
            if (pos.element) {
                pos.element.style.transform = `translateX(${pos.x}px)`;
            }
            if (pos.x + pos.width < 0) {
                toRemove.push(id);
            }
        });

        if (toRemove.length > 0) {
            setDisplayedEvents((prev) => prev.filter((e) => !toRemove.includes(e.id)));
            toRemove.forEach((id) => positionsMapRef.current.delete(id));
        }

        trySpawn();
    }, [computeSpeed, trySpawn]);

    useEffect(() => {
        animFrameRef.current = requestAnimationFrame(animationLoop);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [animationLoop]);

    const pause = useCallback(() => {
        isPausedRef.current = true;
    }, []);
    const resume = useCallback(() => {
        isPausedRef.current = false;
    }, []);

    return (
        <footer className='shrink-0 w-full border-t border-border bg-background h-12'>
            <div
                ref={containerRef}
                className='relative h-full overflow-hidden bg-muted/50'
                onMouseEnter={pause}
                onMouseLeave={resume}
                aria-label='Simulation event ticker'
            >
                {/* hidden measurement span – same styling as ticker items */}
                <span ref={measureRef} className='invisible absolute whitespace-nowrap text-md' aria-hidden='true' />

                {events.length === 0 ? (
                    <div className='h-full flex items-center justify-center'>
                        <span className='text-xs text-muted-foreground'>No events yet</span>
                    </div>
                ) : (
                    displayedEvents.map(({ id, event }) => (
                        <div
                            key={id}
                            ref={(el) => registerElement(id, el)}
                            className='absolute top-0 left-0 h-full flex items-center whitespace-nowrap will-change-transform'
                            style={{
                                transform: `translateX(${positionsMapRef.current.get(id)?.x ?? containerWidthRef.current}px)`,
                            }}
                        >
                            <span className='inline-flex items-center gap-1.5 text-md select-none'>
                                <span className={cn('text-muted-foreground text-xs', textColor(event.category))}>
                                    {mapTickToDate(event.tick)}
                                </span>
                                <span className='text-foreground/90'>{event.message}</span>
                            </span>
                        </div>
                    ))
                )}
            </div>
        </footer>
    );
}
