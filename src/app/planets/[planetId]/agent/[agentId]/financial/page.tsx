'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import AgentFinancialOverview from '@/app/planets/[planetId]/agent/[agentId]/financial/_components/AgentFinancialOverview';
import LoanPanel from '@/app/planets/[planetId]/agent/[agentId]/financial/_components/LoanPanel';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { EuroIcon } from 'lucide-react';
import BankPanel from './_components/BankPanel';

export default function FinancialPage() {
    const { agentId, planetId, detail, assets, isLoading, hasNoAssets, isOwnAgent, myAgentId } = useAgentPlanetDetail();

    const trpc = useTRPC();

    const { data, isLoading: isEconomyLoading } = useSimulationQuery(
        trpc.simulation.getPlanetEconomy.queryOptions({ planetId }),
    );

    const { data: loanConditionsData } = useSimulationQuery(
        trpc.simulation.getLoanConditions.queryOptions({ agentId, planetId: detail?.planetId ?? '' }),
    );
    const loanConditions = loanConditionsData?.conditions ?? null;

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
                        <BankPanel bank={economy.bank} priceLevel={economy.priceLevel ?? undefined} />

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
