'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Page } from '@/components/client/Page';
import { CURRENCY_RESOURCE_PREFIX } from '@/simulation/market/currencyResources';
import { ALL_RESOURCES } from '@/simulation/planet/resourceCatalog';
import { useMemo } from 'react';
import MarketPanel from './_components/MarketPanel';
import MultiProductPriceChart from './_components/MultiProductPriceChart';

export default function MarketPage() {
    const {
        agentId,
        planetId,
        detail,
        assets,
        ships,
        tick,
        isLoading,
        hasNoAssets,
        isOwnAgent,
        isOwnAgentUnknown,
        isAuthenticatedWithoutAgentId,
        myAgentId,
    } = useAgentPlanetDetail();

    const allResourceNames = useMemo(
        () =>
            ALL_RESOURCES.filter(
                (r) => r.form !== 'landBoundResource' && !r.name.startsWith(CURRENCY_RESOURCE_PREFIX),
            ).map((r) => r.name),
        [],
    );

    return (
        <Page title={`Market`}>
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
                <MultiProductPriceChart planetId={planetId} allResourceNames={allResourceNames} />
                {assets ? (
                    <div data-tour='market-overview'>
                        <MarketPanel
                            agentId={agentId}
                            planetId={planetId}
                            assets={assets}
                            allPlanetDeposits={detail?.allPlanetDeposits}
                            ships={ships}
                            dataTick={tick}
                        />
                    </div>
                ) : null}
            </AgentAccessGuard>
        </Page>
    );
}
