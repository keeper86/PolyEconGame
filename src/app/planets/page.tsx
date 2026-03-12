'use client';

import PlanetSummaryCard from '@/app/planets/PlanetSummaryCard';
import { Page } from '@/components/client/Page';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';

const REFETCH_INTERVAL_MS = 1000;

export default function PlanetsPage() {
    const trpc = useTRPC();

    const { isLoading, data } = useQuery({
        ...trpc.simulation.getLatestPlanetSummaries.queryOptions(),
        refetchInterval: REFETCH_INTERVAL_MS,
    });

    const tick = data?.tick ?? 0;
    const planetSummaries = data?.planets ?? [];

    return (
        <Page title='Planets'>
            {!isLoading && tick > 0 && planetSummaries.length > 0 ? (
                <div className='grid grid-cols-1 gap-4'>
                    {planetSummaries.map((p) => (
                        <PlanetSummaryCard key={p.planetId} summary={p} />
                    ))}
                </div>
            ) : (
                <div className='text-sm text-muted-foreground'>Waiting for simulation data…</div>
            )}
        </Page>
    );
}
