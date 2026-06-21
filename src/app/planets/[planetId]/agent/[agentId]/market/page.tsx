'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import MarketPanel from './_components/MarketPanel';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Page } from '@/components/client/Page';
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export default function MarketPage() {
    const { agentId, planetId, detail, assets, isLoading, hasNoAssets, isOwnAgent, myAgentId } = useAgentPlanetDetail();
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
            <AgentAccessGuard isLoading={myAgentId.isLoading} isOwnAgent={isOwnAgent}>
                {hasNoAssets ? (
                    <NoAssetsMessage planetId={planetId} agentId={agentId} isOwnAgent={isOwnAgent} />
                ) : !isLoading && assets ? (
                    <div data-tour='market-overview'>
                        <MarketPanel
                            agentId={agentId}
                            planetId={planetId}
                            assets={assets}
                            allPlanetDeposits={detail?.allPlanetDeposits}
                            showAll={showAll}
                        />
                    </div>
                ) : (
                    <div className='text-sm text-muted-foreground'>Loading…</div>
                )}
            </AgentAccessGuard>
        </Page>
    );
}
