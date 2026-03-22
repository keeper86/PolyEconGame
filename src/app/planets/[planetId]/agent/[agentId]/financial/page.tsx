'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import AgentFinancialPanel from '@/app/planets/[planetId]/agent/_component/AgentFinancialPanel';
import AutomationPanel from '@/app/planets/[planetId]/agent/_component/AutomationPanel';
import LoanPanel from '@/app/planets/[planetId]/agent/_component/LoanPanel';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { agriculturalProductResourceType } from '@/simulation/planet/resources';

export default function FinancialPage() {
    const { agentId, planetId, detail, assets, isLoading, hasNoAssets, isOwnAgent, myAgentId } = useAgentPlanetDetail();

    return (
        <AgentAccessGuard
            agentId={agentId}
            agentName={detail?.agentName ?? 'Agent'}
            isLoading={myAgentId.isLoading}
            isOwnAgent={isOwnAgent}
        >
            {hasNoAssets ? (
                <NoAssetsMessage planetId={planetId} />
            ) : !isLoading && assets ? (
                <div className='space-y-6'>
                    <AgentFinancialPanel
                        deposits={assets.deposits ?? 0}
                        loans={assets.loans ?? 0}
                        lastWageBill={assets.lastWageBill ?? 0}
                        foodMarket={assets.market?.sell[agriculturalProductResourceType.name]}
                    />
                    <LoanPanel agentId={agentId} planetId={detail?.planetId ?? ''} />
                    <AutomationPanel
                        agentId={agentId}
                        automateWorkerAllocation={detail?.automateWorkerAllocation ?? false}
                        automatePricing={detail?.automatePricing ?? false}
                    />
                </div>
            ) : (
                <div className='text-sm text-muted-foreground'>Loading…</div>
            )}
        </AgentAccessGuard>
    );
}
