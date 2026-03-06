'use client';

import PlanetSummaryCard from '@/app/planets/PlanetSummaryCard';
import { Page } from '@/components/client/Page';
import TickDisplay from '@/components/client/TickDisplay';
import { usePlanetData } from '@/hooks/usePlanetData';

export default function PlanetsPage() {
    const { tick, planets, isLoading } = usePlanetData();

    return (
        <Page title='Planets'>
            <div className='mb-4'>
                <TickDisplay tick={tick} />
            </div>

            {!isLoading && tick > 0 && planets.length > 0 ? (
                <div className='grid grid-cols-1 gap-4'>
                    {planets.map((p) => (
                        <PlanetSummaryCard
                            key={p.planetId}
                            planetId={p.planetId}
                            populationTotal={p.populationTotal}
                            planet={p.planet}
                        />
                    ))}
                </div>
            ) : (
                <div className='text-sm text-muted-foreground'>Waiting for simulation data…</div>
            )}
        </Page>
    );
}
