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
        isAuthenticatedWithoutAgentId,
        myAgentId,
    } = useAgentPlanetDetail();
    const [showRelevant, setShowRelevant] = useState(true);

    return (
        <Page
            title={`Market Overview`}
            headerComponent={
                <div className='flex items-center justify-between gap-3'>
                    <div className='flex items-center gap-2'>
                        <Label htmlFor='show-all-resources' className='text-xs text-muted-foreground cursor-pointer'>
                            Only relevant resources
                        </Label>
                        <Switch id='show-all-resources' checked={showRelevant} onCheckedChange={setShowRelevant} />
                    </div>
                </div>
            }
        >
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
                            showAll={!showRelevant}
                            ships={ships}
                        />
                    </div>
                ) : null}
            </AgentAccessGuard>
        </Page>
    );
}
