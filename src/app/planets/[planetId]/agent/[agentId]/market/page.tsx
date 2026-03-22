'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import SellOffersPanel from '@/app/planets/[planetId]/agent/_component/SellOffersPanel';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';

export default function MarketPage() {
    const { agentId, planetId, detail, assets, isLoading, isOwnAgent, myAgentId } = useAgentPlanetDetail();

    return (
        <AgentAccessGuard
            agentId={agentId}
            agentName={detail?.agentName ?? 'Agent'}
            isLoading={myAgentId.isLoading}
            isOwnAgent={isOwnAgent}
        >
            {!isLoading && assets ? (
                <SellOffersPanel
                    agentId={agentId}
                    planetId={planetId}
                    sellOffers={assets.market?.sell ?? {}}
                    automatePricing={detail?.automatePricing ?? false}
                />
            ) : (
                <div className='text-sm text-muted-foreground'>Loading…</div>
            )}
        </AgentAccessGuard>
    );
}
