'use client';

import PlanetDetails from '@/app/planets/PlanetDetails';
import { Page } from '@/components/client/Page';
import TickDisplay from '@/components/client/TickDisplay';
import { usePlanetData, usePlanetHistory } from '@/hooks/usePlanetData';
import type { Planet } from '@/simulation/planet';

function PlanetDetailsWithHistory({ planet }: { planet: Planet }) {
    const { history } = usePlanetHistory(planet.id);

    return <PlanetDetails planet={planet} history={history} latestPopulation={planet.population} />;
}

export default function PlanetsPage() {
    const { tick, planets, isLoading } = usePlanetData();

    return (
        <Page title='Planets'>
            <div className='mb-4'>
                <TickDisplay tick={tick} />
            </div>

            {!isLoading && tick > 0 && planets.length > 0 ? (
                <div className='space-y-4'>
                    {planets.map((p) => (
                        <PlanetDetailsWithHistory key={p.planetId} planet={p.planet} />
                    ))}
                </div>
            ) : (
                <div className='text-sm text-muted-foreground'>Waiting for simulation data…</div>
            )}
        </Page>
    );
}
