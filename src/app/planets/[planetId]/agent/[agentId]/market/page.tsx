'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import BuyBidsPanel from '@/app/planets/[planetId]/agent/_component/BuyBidsPanel';
import SellOffersPanel from '@/app/planets/[planetId]/agent/_component/SellOffersPanel';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';

export default function MarketPage() {
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
                <div className='space-y-3'>
                    <SellOffersPanel
                        agentId={agentId}
                        planetId={planetId}
                        sellOffers={assets.market?.sell ?? {}}
                        storageFacility={assets.storageFacility}
                        automatePricing={detail?.automatePricing ?? false}
                    />
                    <BuyBidsPanel
                        agentId={agentId}
                        planetId={planetId}
                        productionFacilities={assets.productionFacilities}
                        buyBids={assets.market?.buy ?? {}}
                        deposits={assets.deposits}
                        automatePricing={detail?.automatePricing ?? false}
                    />
                </div>
            ) : (
                <div className='text-sm text-muted-foreground'>Loading…</div>
            )}
        </AgentAccessGuard>
    );
}
