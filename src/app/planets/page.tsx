'use client';

import PlanetSummaryCard from '@/app/planets/PlanetSummaryCard';
import { Page } from '@/components/client/Page';
import { useTRPC } from '@/lib/trpc';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';

export default function PlanetsPage() {
    const trpc = useTRPC();

    const { isLoading, data } = useSimulationQuery(trpc.simulation.getLatestPlanetSummaries.queryOptions());

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
