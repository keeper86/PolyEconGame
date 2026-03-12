'use client';

import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import PlanetOverviewPanel from './PlanetOverviewPanel';

const REFETCH_INTERVAL_MS = 1000;

export default function PlanetOverviewPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const trpc = useTRPC();

    const { data, isLoading } = useQuery({
        ...trpc.simulation.getPlanetOverview.queryOptions({ planetId }),
        refetchInterval: REFETCH_INTERVAL_MS,
    });

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
