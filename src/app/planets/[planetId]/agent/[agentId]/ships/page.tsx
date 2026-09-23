'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Page } from '@/components/client/Page';
import { ShipsPanel } from './_components/ShipsPanel';

export default function AgentShipsPage() {
    const {
        agentId,
        planetId,
        isOwnAgent,
        isOwnAgentUnknown,
        isAuthenticatedWithoutAgentId,
        myAgentId,
        tick,
        assets,
        isLoading,
        hasNoAssets,
    } = useAgentPlanetDetail();

    return (
        <Page title={`Ship Management`}>
            <AgentAccessGuard
                isLoading={myAgentId.isLoading}
                isOwnAgent={isOwnAgent}
                isOwnAgentUnknown={isOwnAgentUnknown}
                isAuthenticatedWithoutAgentId={isAuthenticatedWithoutAgentId}
                hasNoAssets={hasNoAssets}
                detailLoading={isLoading}
                agentId={agentId}
                planetId={planetId}
            >
                {assets ? <ShipsPanel agentId={agentId} planetId={planetId} assets={assets} tick={tick} /> : null}
            </AgentAccessGuard>
        </Page>
    );
}
