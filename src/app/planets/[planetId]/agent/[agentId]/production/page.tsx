'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import ProductionFacilitiesPanel from './_component/ProductionFacilitiesPanel';

export default function ProductionPage() {
    const { agentId, planetId, assets, isLoading, hasNoAssets, isOwnAgent, myAgentId } = useAgentPlanetDetail();

    return (
        <AgentAccessGuard isLoading={myAgentId.isLoading} isOwnAgent={isOwnAgent}>
            {hasNoAssets ? (
                <NoAssetsMessage planetId={planetId} agentId={agentId} isOwnAgent={isOwnAgent} />
            ) : !isLoading && assets ? (
                <>
                    <ProductionFacilitiesPanel
                        facilities={assets.productionFacilities}
                        shipConstructionFacilities={assets.shipConstructionFacilities}
                        agentId={agentId}
                        planetId={planetId}
                    />
                </>
            ) : (
                <div className='text-sm text-muted-foreground'>Loading…</div>
            )}
        </AgentAccessGuard>
    );
}
