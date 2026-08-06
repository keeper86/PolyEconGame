'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Page } from '@/components/client/Page';
import { TRADABLE_RESOURCES } from '@/simulation/planet/resourceCatalog';
import { useMemo, useState } from 'react';
import MarketPanel from './_components/MarketPanel';
import MultiProductPriceChart, { MultiProductPriceChartTrigger } from './_components/MultiProductPriceChart';

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

    const [isChartOpen, setIsChartOpen] = useState(false);

    const allResourceNames = useMemo(() => TRADABLE_RESOURCES.map((r) => r.name), []);

    return (
        <Page
            title={`Market`}
            headerComponent={
                <MultiProductPriceChartTrigger isOpen={isChartOpen} onToggle={() => setIsChartOpen((prev) => !prev)} />
            }
        >
            <MultiProductPriceChart
                planetId={planetId}
                allResourceNames={allResourceNames}
                isOpen={isChartOpen}
                onOpenChange={setIsChartOpen}
            />
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
