'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import ProductionFacilitiesPanel from './_component/ProductionFacilitiesPanel';
import { Page } from '@/components/client/Page';

export default function ProductionPage() {
    const { agentId, planetId, assets, isLoading, hasNoAssets, isOwnAgent, myAgentId } = useAgentPlanetDetail();

    return (
        <Page title={`Production Management`}>
            <AgentAccessGuard isLoading={myAgentId.isLoading} isOwnAgent={isOwnAgent}>
                {hasNoAssets ? (
                    <NoAssetsMessage planetId={planetId} agentId={agentId} isOwnAgent={isOwnAgent} />
                ) : !isLoading && assets ? (
                    <div data-tour='production-facilities'>
                        <ProductionFacilitiesPanel
                            facilities={assets.productionFacilities}
                            agentId={agentId}
                            planetId={planetId}
                        />
                    </div>
                ) : (
                    <div className='text-sm text-muted-foreground'>Loading…</div>
                )}
            </AgentAccessGuard>
        </Page>
    );
}
