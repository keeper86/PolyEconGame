'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import MarketPanel from './_components/MarketPanel';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Page } from '@/components/client/Page';
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export default function MarketPage() {
    const {
        agentId,
        planetId,
        detail,
        assets,
        ships,
        isLoading,
        hasNoAssets,
        isOwnAgent,
        isOwnAgentUnknown,
        myAgentId,
    } = useAgentPlanetDetail();
    const [showAll, setShowAll] = useState(false);

    return (
        <Page
            title={`Market Overview`}
            headerComponent={
                <div className='flex items-center justify-between gap-3'>
                    <div className='flex items-center gap-2'>
                        <Label htmlFor='show-all-resources' className='text-xs text-muted-foreground cursor-pointer'>
                            Show all resources
                        </Label>
                        <Switch id='show-all-resources' checked={showAll} onCheckedChange={setShowAll} />
                    </div>
                </div>
            }
        >
            <AgentAccessGuard
                isLoading={myAgentId.isLoading}
                isOwnAgent={isOwnAgent}
                isOwnAgentUnknown={isOwnAgentUnknown}
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
                            showAll={showAll}
                            ships={ships}
                        />
                    </div>
                ) : null}
            </AgentAccessGuard>
        </Page>
    );
}
