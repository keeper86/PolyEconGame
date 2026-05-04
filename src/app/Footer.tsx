'use client';

import { mapTickToDate } from '@/components/client/TickDisplay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import type { TickerEvent } from '@/server/controller/simulation';
import { useCallback, useEffect, useRef, useState } from 'react';

/* ---------- constants ---------- */
const MAX_LOCAL_EVENTS = 60;
const GAP_PX = 24; // minimum horizontal gap between events (steric interaction)
const BASE_SPEED_PX_PER_SEC = 80;
const MIN_SPEED_PX_PER_SEC = 30;
const MAX_SPEED_PX_PER_SEC = 300;

/* ---------- helpers ---------- */
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

/* ---------- component ---------- */
export default function Footer() {
    const trpc = useTRPC();
    const [lastSeenId, setLastSeenId] = useState<number | undefined>(undefined);
    const [events, setEvents] = useState<TickerEvent[]>([]); // the master list (up to 60 latest)

    const { data } = useSimulationQuery({
        ...trpc.simulation.getTickerEvents.queryOptions({ lastSeenId }),
    });

    // Merge new server events into the local list
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

    /* ---- displayed events (only the visible ones on screen) ---- */
    const [displayedEvents, setDisplayedEvents] = useState<{ id: number; event: TickerEvent }[]>([]);

    /* ---- position map (kept outside React for 60 fps direct DOM writes) ---- */
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

    /* ---- ResizeObserver – keep container width up to date ---- */
    useEffect(() => {
        const el = containerRef.current;
        if (!el) {
            return;
        }
        const observer = new ResizeObserver(([entry]) => {
            if (entry) {
                containerWidthRef.current = entry.contentRect.width;
            }
        });
        observer.observe(el);
        // initial measurement
        containerWidthRef.current = el.clientWidth;
        return () => observer.disconnect();
    }, []);

    /* ---- measure text width via hidden span ---- */
    const measureTextWidth = useCallback((text: string) => {
        const span = measureRef.current;
        if (!span) {
            return 100;
        } // fallback
        span.textContent = text;
        return span.offsetWidth;
    }, []);

    /* ---- find next event that hasn't been displayed yet ---- */
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

    /* ---- compute speed from pending count ---- */
    const computeSpeed = useCallback((pending: number) => {
        const base = BASE_SPEED_PX_PER_SEC;
        const min = MIN_SPEED_PX_PER_SEC;
        const max = MAX_SPEED_PX_PER_SEC;
        const factor = 0.15; // how much faster per pending event
        return Math.min(max, Math.max(min, base * (1 + pending * factor)));
    }, []);

    /* ---- spawn a new event if space is available ---- */
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

        // check steric interaction: enough room for the new element at the right edge?
        let canSpawn = true;
        if (positions.size > 0) {
            const rightMost = Math.max(...Array.from(positions.values(), (p) => p.x));
            // width of the rightmost item
            const rightMostWidth = Array.from(positions.values()).find((p) => p.x === rightMost)?.width ?? 0;
            if (rightMost + rightMostWidth + gap + width > containerWidth) {
                canSpawn = false;
            }
        }

        if (canSpawn) {
            const id = nextEvent.id;
            const startX = containerWidth; // just off the right edge

            // add to positions map immediately – prevents double spawns this frame
            positions.set(id, { x: startX, width, element: null });
            lastDisplayedIdRef.current = id;
            spawnLockRef.current = true; // released after the DOM element is attached

            setDisplayedEvents((prev) => [...prev, { id, event: nextEvent }]);
        }
    }, [findNextEvent, measureTextWidth]);

    /* ---- register an event's DOM element when it mounts ---- */
    const registerElement = useCallback((id: number, el: HTMLDivElement | null) => {
        if (!el) {
            return;
        }
        const pos = positionsMapRef.current.get(id);
        if (!pos) {
            return;
        }

        pos.element = el;
        // immediately place it at the starting x (which is already set)
        el.style.transform = `translateX(${pos.x}px)`;
        // unlock spawning now that the element is ready
        spawnLockRef.current = false;
    }, []);

    /* ---- animation loop ---- */
    const animationLoop = useCallback(() => {
        animFrameRef.current = requestAnimationFrame(animationLoop);

        if (isPausedRef.current) {
            lastTimestampRef.current = 0; // reset delta on resume
            return;
        }

        const now = performance.now();
        if (lastTimestampRef.current === 0) {
            lastTimestampRef.current = now;
            return; // first frame after pause – skip update
        }
        const deltaMs = now - lastTimestampRef.current;
        lastTimestampRef.current = now;

        // pending count = how many events still haven't been shown
        const all = eventsRef.current;
        const pending =
            lastDisplayedIdRef.current === undefined
                ? all.length
                : all.filter((e) => e.id > lastDisplayedIdRef.current!).length;
        speedRef.current = computeSpeed(pending);

        const pxPerMs = speedRef.current / 1000;
        const toRemove: number[] = [];

        positionsMapRef.current.forEach((pos, id) => {
            pos.x -= pxPerMs * deltaMs;
            if (pos.element) {
                pos.element.style.transform = `translateX(${pos.x}px)`;
            }
            // remove if completely scrolled off left edge
            if (pos.x + pos.width < 0) {
                toRemove.push(id);
            }
        });

        // clean up removed events
        if (toRemove.length > 0) {
            setDisplayedEvents((prev) => prev.filter((e) => !toRemove.includes(e.id)));
            toRemove.forEach((id) => positionsMapRef.current.delete(id));
        }

        // try to spawn new events
        trySpawn();
    }, [computeSpeed, trySpawn]);

    // start / stop animation
    useEffect(() => {
        animFrameRef.current = requestAnimationFrame(animationLoop);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [animationLoop]);

    // pause / resume
    const pause = useCallback(() => {
        isPausedRef.current = true;
    }, []);
    const resume = useCallback(() => {
        isPausedRef.current = false;
    }, []);

    // clear everything when event list resets? (optional – we keep lastDisplayedId across updates)

    return (
        <footer className='shrink-0 w-full border-t border-border bg-background h-12'>
            {events.length === 0 ? (
                <div className='h-full flex items-center justify-center bg-muted/50'>
                    <span className='text-xs text-muted-foreground'>No events yet</span>
                </div>
            ) : (
                <div
                    ref={containerRef}
                    className='relative h-full overflow-hidden bg-muted/50'
                    onMouseEnter={pause}
                    onMouseLeave={resume}
                    aria-label='Simulation event ticker'
                >
                    {/* hidden measurement span – matches the exact styling of ticker items */}
                    <span
                        ref={measureRef}
                        className='invisible absolute whitespace-nowrap text-md'
                        aria-hidden='true'
                        style={{ fontKerning: 'auto' }}
                    />

                    {displayedEvents.map(({ id, event }) => (
                        <div
                            key={id}
                            ref={(el) => registerElement(id, el)}
                            className='absolute top-0 left-0 h-full flex items-center whitespace-nowrap will-change-transform'
                            style={{ transform: `translateX(${containerWidthRef.current}px)` }} // initial value (overridden immediately)
                        >
                            <span className='inline-flex items-center gap-1.5 text-md select-none'>
                                <span className={cn('text-muted-foreground', textColor(event.category))}>
                                    {mapTickToDate(event.tick)}
                                </span>
                                <span className='text-foreground/90'>{event.message}</span>
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </footer>
    );
}
