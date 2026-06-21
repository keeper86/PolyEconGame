'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import { StorageOverview } from '@/app/planets/[planetId]/agent/_component/StorageOverview';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Page } from '@/components/client/Page';

export default function StoragePage() {
    const { agentId, planetId, assets, isLoading, hasNoAssets, isOwnAgent, myAgentId } = useAgentPlanetDetail();

    return (
        <Page title={`Storage Overview`}>
            <AgentAccessGuard isLoading={myAgentId.isLoading} isOwnAgent={isOwnAgent}>
                {hasNoAssets ? (
                    <NoAssetsMessage planetId={planetId} agentId={agentId} isOwnAgent={isOwnAgent} />
                ) : !isLoading && assets?.storageFacility ? (
                    <div data-tour='storage-overview'>
                        <StorageOverview storage={assets.storageFacility} />
                    </div>
                ) : (
                    <div className='text-sm text-muted-foreground'>Loading…</div>
                )}
            </AgentAccessGuard>
        </Page>
    );
}
