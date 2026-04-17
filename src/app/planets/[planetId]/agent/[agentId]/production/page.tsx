'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import ProductionFacilitiesPanel from './_component/ProductionFacilitiesPanel';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { AgentMetricChart } from '@/components/client/AgentMetricChart';

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
                <>
                    <div className='grid grid-cols-1 gap-4 md:grid-cols-2 mt-4'>
                        <AgentMetricChart agentId={agentId} granularity='monthly' metric='consumptionValue' />
                        <AgentMetricChart agentId={agentId} granularity='monthly' metric='productionValue' />
                    </div>
                    <ProductionFacilitiesPanel
                        facilities={assets.productionFacilities}
                        shipyardFacilities={assets.shipyardFacilities}
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
