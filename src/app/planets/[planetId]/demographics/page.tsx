'use client';

import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import PlanetDemography from './PlanetDemography';

const REFETCH_INTERVAL_MS = 1000;

export default function PlanetDemographicsPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const trpc = useTRPC();

    const { data, isLoading } = useQuery({
        ...trpc.simulation.getPlanetDemographics.queryOptions({ planetId }),
        refetchInterval: REFETCH_INTERVAL_MS,
    });

    if (isLoading) {
        return <div className='text-sm text-muted-foreground'>Loading demographics…</div>;
    }

    const demographics = data?.demographics ?? null;

    if (!demographics) {
        return <div className='text-sm text-muted-foreground'>Planet not found.</div>;
    }

    return <PlanetDemography rows={demographics.rows} />;
}
