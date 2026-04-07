'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import ProductionFacilitiesPanel from './_component/ProductionFacilitiesPanel';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';

export default function ProductionPage() {
    const { agentId, planetId, detail, assets, isLoading, hasNoAssets, isOwnAgent, myAgentId } = useAgentPlanetDetail();

    return (
        <AgentAccessGuard
            agentId={agentId}
            agentName={detail?.agentName ?? 'Agent'}
            isLoading={myAgentId.isLoading}
            isOwnAgent={isOwnAgent}
        >
            {hasNoAssets ? (
                <NoAssetsMessage planetName={planetId} agentId={agentId} />
            ) : !isLoading && assets ? (
                <ProductionFacilitiesPanel
                    facilities={assets.productionFacilities ?? []}
                    agentId={agentId}
                    planetId={planetId}
                />
            ) : (
                <div className='text-sm text-muted-foreground'>Loading…</div>
            )}
        </AgentAccessGuard>
    );
}
