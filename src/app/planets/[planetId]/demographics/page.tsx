'use client';

import { useTRPC } from '@/lib/trpc';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useParams } from 'next/navigation';
import PlanetDemography from './PlanetDemography';

export default function PlanetDemographicsPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const trpc = useTRPC();

    const { data, isLoading } = useSimulationQuery(trpc.simulation.getPlanetDemographics.queryOptions({ planetId }));

    if (isLoading) {
        return <div className='text-sm text-muted-foreground'>Loading demographics…</div>;
    }

    const demographics = data?.demographics ?? null;

    if (!demographics) {
        return <div className='text-sm text-muted-foreground'>Planet not found.</div>;
    }

    return <PlanetDemography rows={demographics.rows} />;
}
