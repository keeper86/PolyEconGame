'use client';

import { SimulationEventTicker } from '@/components/client/SimulationEventTicker';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import type { TickerEvent } from '@/server/controller/simulation';
import { useEffect, useRef, useState } from 'react';

export default function Footer() {
    const trpc = useTRPC();
    const [events, setEvents] = useState<TickerEvent[]>([]);
    const lastIdRef = useRef<number | undefined>(undefined);

    const { data } = useSimulationQuery({
        ...trpc.simulation.getTickerEvents.queryOptions(),
        refetchIntervalMs: 3000,
    });

    useEffect(() => {
        const rawEvents = data?.tickerEvents;
        if (!rawEvents || rawEvents.length === 0) {
            return;
        }

        const newEvents = rawEvents.filter((e) => e.id !== undefined && e.id > (lastIdRef.current ?? -1));
        if (newEvents.length === 0) {
            return;
        }

        setEvents((prev) => [...prev, ...newEvents]);
        const maxId = Math.max(...newEvents.map((e) => e.id ?? 0));
        lastIdRef.current = maxId;
    }, [data]);

    const recentEvents = events.slice(-20);

    return (
        <footer className='shrink-0 w-full border-t border-border bg-background h-12'>
            <SimulationEventTicker events={recentEvents} className='w-full rounded-none border-0' />
        </footer>
    );
}
