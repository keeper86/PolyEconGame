'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import AutomationPanel from '@/app/planets/[planetId]/agent/[agentId]/workforce/_component/AutomationPanel';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import WorkerAllocationPanel from '@/app/planets/[planetId]/agent/[agentId]/workforce/_component/WorkerAllocationPanel';
import WorkforceDemographyPanel from '@/app/planets/[planetId]/agent/[agentId]/workforce/_component/WorkforceDemographyPanel';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { AgentMetricChart } from '@/components/client/AgentMetricChart';
import { Page } from '@/components/client/Page';
import { Card, CardContent } from '@/components/ui/card';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { DEFAULT_WAGE_PER_EDU } from '@/simulation/financial/financialTick';
import { educationLevelKeys } from '@/simulation/population/education';
import type { EducationLevelType } from '@/simulation/population/education';
import { Coins } from 'lucide-react';

export default function WorkforcePage() {
    const { agentId, planetId, detail, assets, isLoading, hasNoAssets, isOwnAgent, myAgentId } = useAgentPlanetDetail();

    const trpc = useTRPC();
    const { data: economyData } = useSimulationQuery(trpc.simulation.getPlanetEconomy.queryOptions({ planetId }));
    const planetWagePerEdu = economyData?.economy?.wagePerEdu ?? null;

    return (
        <Page title={`Workforce Management`}>
            <Card className='mt-4'>
                <CardContent className='px-3 pb-3 space-y-3'>
                    <div>
                        <div className='flex items-center gap-1 text-xs text-muted-foreground mb-1'>
                            <Coins className='h-3 w-3' />
                            Planet avg. wage per worker / tick
                        </div>
                        <div className='grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5'>
                            {educationLevelKeys.map((edu) => {
                                const wage = planetWagePerEdu?.[edu] ?? DEFAULT_WAGE_PER_EDU;
                                return (
                                    <div key={edu} className='flex items-baseline justify-between text-xs gap-2'>
                                        <span className='text-muted-foreground capitalize'>{edu}</span>
                                        <span className='tabular-nums font-medium'>
                                            {formatNumberWithUnit(wage, 'currency', planetId)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </CardContent>
            </Card>
            <AgentAccessGuard isLoading={myAgentId.isLoading} isOwnAgent={isOwnAgent}>
                {hasNoAssets ? (
                    <NoAssetsMessage planetId={planetId} agentId={agentId} isOwnAgent={isOwnAgent} />
                ) : !isLoading && assets ? (
                    <div className='space-y-6'>
                        <Card>
                            <CardContent className='px-3 pb-3 space-y-3'>
                                <div>
                                    <div className='flex items-center gap-1 text-xs text-muted-foreground mb-1'>
                                        <Coins className='h-3 w-3' />
                                        Your wage per worker / tick
                                    </div>
                                    <div className='grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5'>
                                        {educationLevelKeys.map((edu) => {
                                            const wage =
                                                (assets.wagePerEdu as Record<EducationLevelType, number>)[edu] ??
                                                DEFAULT_WAGE_PER_EDU;
                                            return (
                                                <div
                                                    key={edu}
                                                    className='flex items-baseline justify-between text-xs gap-2'
                                                >
                                                    <span className='text-muted-foreground capitalize'>{edu}</span>
                                                    <span className='tabular-nums font-medium'>
                                                        {formatNumberWithUnit(wage, 'currency', planetId)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <AutomationPanel
                            agentId={agentId}
                            automateWorkerAllocation={detail?.automateWorkerAllocation ?? false}
                        />
                        <WorkerAllocationPanel
                            agentId={agentId}
                            planetId={planetId}
                            allocatedWorkers={assets.allocatedWorkers ?? {}}
                            automateWorkerAllocation={detail?.automateWorkerAllocation ?? false}
                        />
                        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 mt-4'>
                            <AgentMetricChart
                                agentId={agentId}
                                planetId={planetId}
                                granularity='monthly'
                                metric='totalWorkers'
                            />
                            <AgentMetricChart
                                agentId={agentId}
                                planetId={planetId}
                                granularity='monthly'
                                metric='wages'
                            />
                        </div>

                        <WorkforceDemographyPanel assets={assets} />
                    </div>
                ) : (
                    <div className='text-sm text-muted-foreground'>Loading…</div>
                )}
            </AgentAccessGuard>
        </Page>
    );
}
