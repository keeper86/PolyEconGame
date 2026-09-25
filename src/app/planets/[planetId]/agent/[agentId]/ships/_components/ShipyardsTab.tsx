'use client';

import React from 'react';
import type { ShipConstructionFacility } from '@/simulation/planet/facility';
import { BuildCard } from '../../production/_component/BuildCard';
import { ActiveShipyardCard } from './ActiveShipyardCard';
import { ShipyardBuildSection } from './ShipyardBuildSection';

export function ShipyardsTab({
    agentId,
    planetId,
    shipConstructionFacilities,
    constructionServicePrice,
}: {
    agentId: string;
    planetId: string;
    shipConstructionFacilities: ShipConstructionFacility[];
    constructionServicePrice: number;
}): React.ReactElement {
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
            <ShipyardBuildSection
                agentId={agentId}
                planetId={planetId}
                constructionServicePrice={constructionServicePrice}
            />
        </div>
    );
}
