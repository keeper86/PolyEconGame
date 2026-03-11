'use client';

import TickDisplay from '@/components/client/TickDisplay';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';

const REFETCH_INTERVAL_MS = 1000;

/** Client wrapper that fetches the current tick from the simulation and displays it. */
export default function TickDisplayConnected() {
    const trpc = useTRPC();
    const { data } = useQuery({
        ...trpc.simulation.getCurrentTick.queryOptions(),
        refetchInterval: REFETCH_INTERVAL_MS,
    });
    const tick = data?.tick ?? 0;
    return <TickDisplay tick={tick} />;
}
