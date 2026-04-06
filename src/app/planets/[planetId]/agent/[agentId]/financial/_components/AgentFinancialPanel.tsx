'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';

import LoanPanel from '@/app/planets/[planetId]/agent/[agentId]/financial/_components/LoanPanel';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import AgentFinancialOverview from '../../../_component/AgentFinancialOverview';

export default function AgentFinancialPanel() {
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
                <div className='space-y-6'>
                    <AgentFinancialOverview
                        deposits={assets.deposits ?? 0}
                        loans={assets.loans ?? 0}
                        lastWageBill={assets.lastWageBill ?? 0}
                    />
                    <LoanPanel agentId={agentId} planetId={detail?.planetId ?? ''} />
                </div>
            ) : (
                <div className='text-sm text-muted-foreground'>Loading…</div>
            )}
        </AgentAccessGuard>
    );
}
