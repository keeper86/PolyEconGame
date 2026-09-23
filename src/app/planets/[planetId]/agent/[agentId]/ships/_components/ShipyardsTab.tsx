'use client';

import React from 'react';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { PRICE_FLOOR } from '@/simulation/constants';
import { constructionServiceResourceType } from '@/simulation/planet/services';
import type { ShipConstructionFacility } from '@/simulation/planet/facility';
import { BuildCard } from '../../production/_component/BuildCard';
import { ActiveShipyardCard } from './ActiveShipyardCard';
import { ShipyardBuildCard } from './ShipyardBuildCard';

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

    const { data: constructionMarket } = useQuery(
        trpc.simulation.getPlanetMarket.queryOptions({
            planetId,
            resourceName: constructionServiceResourceType.name,
        }),
    );
    const constructionServicePrice = constructionMarket?.market?.clearingPrice ?? PRICE_FLOOR;

    return (
        <div className='flex flex-row gap-3 flex-wrap mt-3'>
            {shipConstructionFacilities.map((sy) =>
                sy.construction !== null ? (
                    <BuildCard
                        key={sy.id}
                        facility={sy}
                        agentId={agentId}
                        planetId={planetId}
                        constructionServicePrice={constructionServicePrice}
                        onBuilt={() => {}}
                        onCancel={() => {}}
                    />
                ) : (
                    <ActiveShipyardCard
                        key={sy.id}
                        facility={sy}
                        agentId={agentId}
                        planetId={planetId}
                        constructionServicePrice={constructionServicePrice}
                    />
                ),
            )}
            <ShipyardBuildCard
                agentId={agentId}
                planetId={planetId}
                constructionServicePrice={constructionServicePrice}
            />
        </div>
    );
}
