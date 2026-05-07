'use client';

import React from 'react';
import { useTRPC } from '@/lib/trpc';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { constructionServiceResourceType } from '@/simulation/planet/services';
import type { ShipConstructionFacility } from '@/simulation/planet/facility';
import { ShipyardBuildSection } from '../../production/_component/ShipyardBuildSection';
import { ActiveShipyardCard } from '../../production/_component/ActiveShipyardCard';
import { UnderConstructionCard } from '../../production/_component/UnderConstructionCard';

export function ShipyardsTab({
    agentId,
    planetId,
    shipConstructionFacilities,
}: {
    agentId: string;
    planetId: string;
    shipConstructionFacilities: ShipConstructionFacility[];
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const { data: constructionMarket } = useQuery(
        trpc.simulation.getPlanetMarket.queryOptions({
            planetId,
            resourceName: constructionServiceResourceType.name,
        }),
    );
    const constructionServicePrice = constructionMarket?.market?.clearingPrice;

    const refresh = () =>
        void queryClient.invalidateQueries({
            queryKey: trpc.simulation.getAgentPlanetDetail.queryKey({ agentId, planetId }),
        });

    return (
        <div className='flex flex-col gap-4 mt-3'>
            <ShipyardBuildSection
                agentId={agentId}
                planetId={planetId}
                constructionServicePrice={constructionServicePrice}
                onBuilt={refresh}
            />
            <div className='flex flex-row gap-3 flex-wrap'>
                {shipConstructionFacilities.map((sy) => {
                    if (sy.construction !== null) {
                        return <UnderConstructionCard key={sy.id} facility={sy} />;
                    }
                    return (
                        <ActiveShipyardCard
                            key={sy.id}
                            facility={sy}
                            agentId={agentId}
                            planetId={planetId}
                            constructionServicePrice={constructionServicePrice}
                            onExpanded={refresh}
                        />
                    );
                })}
            </div>
            {shipConstructionFacilities.length === 0 && (
                <p className='text-sm text-muted-foreground'>No shipyards on this planet yet.</p>
            )}
        </div>
    );
}
