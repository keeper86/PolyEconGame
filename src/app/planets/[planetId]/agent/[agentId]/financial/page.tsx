'use client';

import AgentFinancialCharts from '@/app/planets/[planetId]/agent/[agentId]/financial/_components/AgentFinancialCharts';
import AgentFinancialOverview from '@/app/planets/[planetId]/agent/[agentId]/financial/_components/AgentFinancialOverview';
import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Page } from '@/components/client/Page';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { totalOutstandingLoans } from '@/simulation/financial/loanTypes';
import { Search } from 'lucide-react';
import { LicensePanel } from '../../_component/LicensePanel';
import LoanPanel from './_components/LoanPanel';
import ProductResolutionPanel from './_components/ProductResolutionPanel';

export default function FinancialPage() {
    const { agentId, planetId, detail, assets, isLoading, hasNoAssets, isOwnAgent, myAgentId, tick } =
        useAgentPlanetDetail();

    const trpc = useTRPC();

    const { data: loanConditionsData } = useSimulationQuery(
        trpc.simulation.getLoanConditions.queryOptions({ agentId, planetId }),
    );
    const loanConditions = loanConditionsData?.conditions ?? {
        lastMonthlyRevenue: 0,
        lastMonthlyExpenses: 0,
        monthlyNetCashFlow: 0,
    };

    return (
        <Page title={`Financial Overview`}>
            <AgentAccessGuard isLoading={myAgentId.isLoading} isOwnAgent={isOwnAgent}>
                {hasNoAssets ? (
                    <NoAssetsMessage planetId={planetId} agentId={agentId} isOwnAgent={isOwnAgent} />
                ) : !isLoading && assets ? (
                    <span className='flex flex-col gap-3'>
                        <Card>
                            <CardContent className='px-3 py-3 space-y-3'>
                                <AgentFinancialOverview
                                    deposits={assets.deposits ?? 0}
                                    loans={totalOutstandingLoans(assets.activeLoans ?? [])}
                                    loanConditions={loanConditions}
                                    planetId={planetId}
                                    agentId={agentId}
                                />
                                <Separator />
                                <AgentFinancialCharts agentId={agentId} planetId={planetId} />
                                <ProductResolutionPanel
                                    monthAcc={assets.monthAcc}
                                    lastMonthAcc={assets.lastMonthAcc}
                                    tick={tick}
                                    planetId={planetId}
                                    agentId={agentId}
                                />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className='px-3 py-3 space-y-3'>
                                <LoanPanel agentId={agentId} planetId={planetId} deposits={assets.deposits ?? 0} />
                            </CardContent>
                        </Card>
                        <LicensePanel
                            agentId={agentId}
                            planetId={detail?.planetId ?? ''}
                            isOwnAgent={isOwnAgent}
                            licenses={assets.licenses}
                        />
                    </span>
                ) : (
                    <div className='text-sm text-muted-foreground'>Loading…</div>
                )}
            </AgentAccessGuard>
        </Page>
    );
}
