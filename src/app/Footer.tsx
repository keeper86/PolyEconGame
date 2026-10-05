'use client';

import { cn } from '@/lib/utils';
import { renderTickerEvent, tickerEventText } from '@/i18n/tickerEventMessage';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import type { TickerEvent } from '@/server/controller/simulation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { mapTickToDate } from '@/components/client/TickDisplay';
import { EventFilterMenu } from '@/components/client/EventFilterMenu';
import { PlanetIcon } from '@/components/client/PlanetIcon';
import { CompanyLogo } from '@/components/client/CompanyLogo';
import { useIsSmallScreen } from '@/hooks/useMobile';
import {
    useEventCategoriesPreference,
    useEventsHideAutomatedPreference,
    useEventsLocalPlanetOnlyPreference,
    useEventsShowHrCompletionPreference,
} from '@/hooks/uiPreferences';
import { useDocumentVisibility } from '@/hooks/useDocumentVisibility';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';

const MAX_LOCAL_EVENTS = 60;
const GAP_PX = 48;
const BASE_SPEED_PX_PER_SEC = 80;
const PLANET_ICON_SIZE_PX = 32;
const PLANET_ICON_ALLOWANCE_PX = PLANET_ICON_SIZE_PX + 6;
const COMPANY_LOGO_SIZE_PX = 32;
const COMPANY_LOGO_ALLOWANCE_PX = COMPANY_LOGO_SIZE_PX + 4;

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
    const params = useParams();
    const planetId = typeof params?.planetId === 'string' ? params.planetId : undefined;
    const locale = useLocale();
    const tEvents = useTranslations('Events');
    const tFooter = useTranslations('Footer');

    const [categories] = useEventCategoriesPreference();
    const [hideAutomated] = useEventsHideAutomatedPreference();
    const [localPlanetOnly] = useEventsLocalPlanetOnlyPreference();
    const [showHrCompletion] = useEventsShowHrCompletionPreference();

    const trpc = useTRPC();
    const [lastSeenId, setLastSeenId] = useState<number | undefined>(undefined);
    const [events, setEvents] = useState<TickerEvent[]>([]);

    const { data } = useSimulationQuery({
        ...trpc.simulation.getTickerEvents.queryOptions({
            lastSeenId,
            filter: { categories, hideAutomated, localPlanetOnly, planetId, showHrCompletion },
        }),
    });

    useEffect(() => {
        if (!data) {
            return;
        }
        if (data.tickerEvents.length > 0) {
            setEvents((prev) => [...prev, ...data.tickerEvents].slice(-MAX_LOCAL_EVENTS));
        }
        if (data.lastEventId !== undefined) {
            setLastSeenId(data.lastEventId);
        }
    }, [data]);

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

    const measureTextWidth = useCallback((dateStr: string, message: string, extraPx: number) => {
        const span = measureRef.current;
        if (!span) {
            return 100 + extraPx;
        }
        span.textContent = `${dateStr} ${message}`;

        return span.offsetWidth + 6 + extraPx;
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

        const dateStr = mapTickToDate(nextEvent.tick, false, locale);
        const message = tickerEventText(
            renderTickerEvent(nextEvent.details, nextEvent.agentName ?? '', tEvents, locale),
        );
        const width = measureTextWidth(
            dateStr,
            message,
            PLANET_ICON_ALLOWANCE_PX + (nextEvent.agentLogo ? COMPANY_LOGO_ALLOWANCE_PX : 0),
        );
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
    }, [computeSpeed, findNextEvent, measureTextWidth, locale, tEvents]);

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

    useDocumentVisibility(pause, resume);

    return (
        <footer className='shrink-0 w-full border-t border-border bg-background h-12'>
            <div className='flex h-full'>
                <div
                    ref={containerRef}
                    className='relative flex-1 min-w-0 overflow-hidden bg-muted/50'
                    style={{ '--ticker-play-state': isPaused ? 'paused' : 'running' } as React.CSSProperties}
                    aria-label={tFooter('ticker')}
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
                            className='ticker-item absolute top-0 sm:top-1 left-0 h-full flex items-center whitespace-nowrap will-change-transform'
                            style={
                                {
                                    '--ticker-start': `${startX}px`,
                                    'animationDuration': `${duration}s`,
                                } as React.CSSProperties
                            }
                            onAnimationEnd={() => setDisplayedEvents((prev) => prev.filter((e) => e.id !== id))}
                        >
                            <span className='inline-flex items-center gap-1.5 text-md select-none'>
                                <PlanetIcon planetId={event.planetId} size={PLANET_ICON_SIZE_PX} />
                                <CompanyLogo
                                    logoKey={event.agentLogo}
                                    size={COMPANY_LOGO_SIZE_PX}
                                    className='align-middle mr-1'
                                />
                                <span className='flex flex-col flex-start text-muted-foreground text-xs'>
                                    <span>{mapTickToDate(event.tick, false, locale)}</span>

                                    <span className={cn('text-sm', textColor(event.category))}>
                                        {renderTickerEvent(event.details, event.agentName ?? '', tEvents, locale)}
                                    </span>
                                </span>
                            </span>
                        </div>
                    ))}
                </div>

                <EventFilterMenu planetId={planetId} />
            </div>
        </footer>
    );
}
