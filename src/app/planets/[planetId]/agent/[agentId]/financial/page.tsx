'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import AgentFinancialOverview from '@/app/planets/[planetId]/agent/_component/AgentFinancialOverview';
import LoanPanel from '@/app/planets/[planetId]/agent/_component/LoanPanel';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { agriculturalProductResourceType } from '@/simulation/planet/resources';
import { EuroIcon, Landmark } from 'lucide-react';
import BankPanel from './BankPanel';

export default function FinancialPage() {
    const { agentId, planetId, detail, assets, isLoading, hasNoAssets, isOwnAgent, myAgentId } = useAgentPlanetDetail();

    const trpc = useTRPC();

    const { data, isLoading: isEconomyLoading } = useSimulationQuery(
        trpc.simulation.getPlanetEconomy.queryOptions({ planetId }),
    );

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
                            lastWageBill={assets.lastWageBill ?? 0}
                            foodMarket={assets.market?.sell[agriculturalProductResourceType.name]}
                        />
                        <Separator />
                        <p className='text-sm font-semibold flex items-center gap-2'>
                            <Landmark className='h-4 w-4 text-muted-foreground' />
                            Borrow from Bank
                        </p>
                        <LoanPanel agentId={agentId} planetId={detail?.planetId ?? ''} />
                    </CardContent>
                </Card>
            ) : (
                <div className='text-sm text-muted-foreground'>Loading…</div>
            )}
        </AgentAccessGuard>
    );
}
