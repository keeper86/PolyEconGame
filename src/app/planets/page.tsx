'use client';

import PlanetDetails from '@/app/planets/PlanetDetails';
import { Page } from '@/components/client/Page';
import SecondTicker from '@/components/client/SecondTicker';
import { useGameState } from '@/hooks/useGameState';

export default function PlanetsPage() {
    const { state, popSeries } = useGameState();

    return (
        <Page title='Planets'>
            <div className='mb-4'>
                <SecondTicker />
            </div>

            {state?.planets && state.planets.length > 0 ? (
                <div className='space-y-4'>
                    {state.planets.map((p) => (
                        <PlanetDetails
                            key={p.id}
                            planet={p}
                            history={popSeries[p.id] ?? []}
                            latestPopulation={p.population}
                            agents={state?.agents?.filter((a) => a.associatedPlanetId === p.id) ?? []}
                        />
                    ))}
                </div>
            ) : (
                <div className='text-sm text-muted-foreground'>Waiting for simulation data…</div>
            )}
        </Page>
    );
}
