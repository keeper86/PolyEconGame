'use client';

import PlanetDetails from '@/app/planets/PlanetDetails';
import { Page } from '@/components/client/Page';
import TickDisplay from '@/components/client/TickDisplay';
import { usePlanetData, usePlanetHistory } from '@/hooks/usePlanetData';
import { useAgentData } from '@/hooks/useAgentData';
import type { Planet, Agent } from '@/simulation/planet';

function PlanetDetailsWithHistory({
    planet,
    agents,
}: {
    planet: Planet;
    agents: ReturnType<typeof useAgentData>['agents'];
}) {
    const { history } = usePlanetHistory(planet.id);
    const agentObjects = agents
        .filter((a) => a.agent?.associatedPlanetId === planet.id)
        .map((a) => a.agent)
        .filter((agent): agent is Agent => agent !== undefined);

    return (
        <PlanetDetails planet={planet} history={history} latestPopulation={planet.population} agents={agentObjects} />
    );
}

export default function PlanetsPage() {
    const { tick, planets, isLoading } = usePlanetData();
    const { agents } = useAgentData();

    return (
        <Page title='Planets'>
            <div className='mb-4'>
                <TickDisplay tick={tick} />
            </div>

            {!isLoading && tick > 0 && planets.length > 0 ? (
                <div className='space-y-4'>
                    {planets.map((p) => (
                        <PlanetDetailsWithHistory key={p.planetId} planet={p.planet} agents={agents} />
                    ))}
                </div>
            ) : (
                <div className='text-sm text-muted-foreground'>Waiting for simulation data…</div>
            )}
        </Page>
    );
}
