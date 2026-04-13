'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import AgentFinancialOverview from '@/app/planets/[planetId]/agent/[agentId]/financial/_components/AgentFinancialOverview';
import AgentFinancialCharts from '@/app/planets/[planetId]/agent/[agentId]/financial/_components/AgentFinancialCharts';
import LoanPanel from '@/app/planets/[planetId]/agent/[agentId]/financial/_components/LoanPanel';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { EuroIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import BankPanel from './_components/BankPanel';

export default function FinancialPage() {
    const { agentId, planetId, detail, assets, isLoading, hasNoAssets, isOwnAgent, myAgentId } = useAgentPlanetDetail();

    const trpc = useTRPC();

    const { data, isLoading: isEconomyLoading } = useSimulationQuery(
        trpc.simulation.getPlanetEconomy.queryOptions({ planetId }),
    );

    const { data: loanConditionsData } = useSimulationQuery(
        trpc.simulation.getLoanConditions.queryOptions({ agentId, planetId }),
    );
    const loanConditions = loanConditionsData?.conditions ?? {
        blendedMonthlyRevenue: 0,
        blendedMonthlyExpenses: 0,
        monthlyNetCashFlow: 0,
    };

    if (isEconomyLoading) {
        return <div className='text-sm text-muted-foreground'>Loading economy data…</div>;
    }

    const economy = data?.economy ?? null;

    if (!economy) {
        return <div className='text-sm text-muted-foreground'>Planet not found.</div>;
    }

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
                <Card>
                    <CardContent className='px-3 py-3 space-y-3'>
                        <BankPanel bank={economy.bank} />

                        <Separator />
                        <p className='text-sm font-semibold flex items-center gap-2'>
                            <EuroIcon className='h-4 w-4 text-muted-foreground' />
                            Financial Position
                        </p>
                        <AgentFinancialOverview
                            deposits={assets.deposits ?? 0}
                            loans={assets.loans ?? 0}
                            loanConditions={loanConditions}
                        />
                        <Collapsible>
                            <CollapsibleTrigger className='flex items-center gap-1 text-xs font-semibold text-muted-foreground w-full group'>
                                <ChevronDown className='h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180' />
                                Historical Trends
                            </CollapsibleTrigger>
                            <CollapsibleContent className='pt-3'>
                                <AgentFinancialCharts agentId={agentId} />
                            </CollapsibleContent>
                        </Collapsible>
                        <Separator />

                        <LoanPanel agentId={agentId} planetId={detail?.planetId ?? ''} />
                    </CardContent>
                </Card>
            ) : (
                <div className='text-sm text-muted-foreground'>Loading…</div>
            )}
        </AgentAccessGuard>
    );
}
