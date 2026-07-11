'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { StoragePanel } from '@/app/planets/[planetId]/agent/[agentId]/storage/_components/StoragePanel';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Page } from '@/components/client/Page';

export default function StoragePage() {
    const { agentId, planetId, assets, isLoading, hasNoAssets, isOwnAgent, isOwnAgentUnknown, myAgentId } =
        useAgentPlanetDetail();

    return (
        <Page title={`Storage Overview`}>
            <AgentAccessGuard
                isLoading={myAgentId.isLoading}
                isOwnAgent={isOwnAgent}
                isOwnAgentUnknown={isOwnAgentUnknown}
                hasNoAssets={hasNoAssets}
                detailLoading={isLoading}
                agentId={agentId}
                planetId={planetId}
            >
                {assets?.storageFacility ? (
                    <div data-tour='storage-overview'>
                        <StoragePanel assets={assets} planetId={planetId} agentId={agentId} />
                    </div>
                ) : null}
            </AgentAccessGuard>
        </Page>
    );
}
