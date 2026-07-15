'use client';

import React from 'react';
import { useTRPC } from '@/lib/trpc';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { constructionServiceResourceType } from '@/simulation/planet/services';
import type { ShipConstructionFacility } from '@/simulation/planet/facility';
import { BuildCard } from '../../production/_component/BuildCard';
import { ShipyardBuildSection } from './ShipyardBuildSection';
import { ActiveShipyardCard } from './ActiveShipyardCard';

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


    // TODO: Use light endpoint for this
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
                        return (
                            <BuildCard
                                key={sy.id}
                                facility={sy}
                                agentId={agentId}
                                planetId={planetId}
                                constructionServicePrice={constructionServicePrice ?? 0}
                                onBuilt={() => {}}
                                onCancel={() => {}}
                            />
                        );
                    }
                    return <ActiveShipyardCard key={sy.id} facility={sy} agentId={agentId} planetId={planetId} />;
                })}
            </div>
            {shipConstructionFacilities.length === 0 && (
                <p className='text-sm text-muted-foreground'>No shipyards on this planet yet.</p>
            )}
        </div>
    );
}
