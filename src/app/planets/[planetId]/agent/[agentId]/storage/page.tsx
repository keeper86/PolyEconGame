'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { StorageOverview } from '@/app/planets/[planetId]/agent/_component/StorageOverview';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';

export default function StoragePage() {
    const { agentId, detail, assets, isLoading, isOwnAgent, myAgentId } = useAgentPlanetDetail();

    return (
        <AgentAccessGuard
            agentId={agentId}
            agentName={detail?.agentName ?? 'Agent'}
            isLoading={myAgentId.isLoading}
            isOwnAgent={isOwnAgent}
        >
            {!isLoading && assets?.storageFacility ? (
                <StorageOverview storage={assets.storageFacility} />
            ) : (
                <div className='text-sm text-muted-foreground'>Loading…</div>
            )}
        </AgentAccessGuard>
    );
}
