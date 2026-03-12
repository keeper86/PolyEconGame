'use client';

import { useTRPC } from '@/lib/trpc';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useParams } from 'next/navigation';
import PlanetOverviewPanel from './PlanetOverviewPanel';

export default function PlanetOverviewPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const trpc = useTRPC();

    const { data, isLoading } = useSimulationQuery(trpc.simulation.getPlanetOverview.queryOptions({ planetId }));

    const tick = data?.tick ?? 0;
    const overview = data?.overview ?? null;

    if (isLoading) {
        return <div className='text-sm text-muted-foreground'>Loading overview…</div>;
    }

    if (!overview) {
        return <div className='text-sm text-muted-foreground'>Planet not found.</div>;
    }

    return <PlanetOverviewPanel overview={overview} tick={tick} />;
}
