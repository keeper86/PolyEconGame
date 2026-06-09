'use client';

import AutomationPanel from '@/app/planets/[planetId]/agent/[agentId]/workforce/_component/AutomationPanel';
import WorkerAllocationPanel from '@/app/planets/[planetId]/agent/[agentId]/workforce/_component/WorkerAllocationPanel';
import WorkforceDemographyPanel from '@/app/planets/[planetId]/agent/[agentId]/workforce/_component/WorkforceDemographyPanel';
import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { AgentMetricChart } from '@/components/client/AgentMetricChart';
import { Page } from '@/components/client/Page';
import { Card, CardContent } from '@/components/ui/card';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { DEFAULT_WAGE_PER_EDU } from '@/simulation/financial/financialTick';
import type { EducationLevelType } from '@/simulation/population/education';
import { educationLevelKeys } from '@/simulation/population/education';
import { Separator } from '@radix-ui/react-dropdown-menu';

export default function WorkforcePage() {
    const { agentId, planetId, detail, assets, isLoading, hasNoAssets, isOwnAgent, myAgentId } = useAgentPlanetDetail();

    const trpc = useTRPC();
    const { data: economyData } = useSimulationQuery(trpc.simulation.getPlanetEconomy.queryOptions({ planetId }));
    const planetWagePerEdu = economyData?.economy?.wagePerEdu ?? null;

    return (
        <Page title={`Workforce Management`}>
            <AgentAccessGuard isLoading={myAgentId.isLoading} isOwnAgent={isOwnAgent}>
                {hasNoAssets ? (
                    <NoAssetsMessage planetId={planetId} agentId={agentId} isOwnAgent={isOwnAgent} />
                ) : !isLoading && assets ? (
                    <div className='space-y-6'>
                        <Card>
                            <CardContent className='px-3 pb-3 space-y-3'>
                                <div className='grid grid-cols-1 gap-x-4 gap-y-0.5'>
                                    <div className='flex items-baseline justify-between text-xs gap-2'>
                                        <span className='text-muted-foreground capitalize'>Education</span>
                                        <span className='tabular-nums'>
                                            <span className='inline-block min-w-[7ch] text-right font-medium'>
                                                Wage
                                            </span>

                                            <span className='inline-block min-w-[9ch] text-right tabular-nums text-muted-foreground text-xs'>
                                                global avg.
                                            </span>
                                        </span>
                                    </div>

                                    <Separator className='my-1' />
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
                                                <span className='tabular-nums'>
                                                    <span className='inline-block min-w-[7ch] text-right font-medium'>
                                                        {formatNumberWithUnit(wage, 'currency', planetId)}
                                                    </span>

                                                    <span className='inline-block min-w-[9ch] text-right tabular-nums text-muted-foreground text-xs'>
                                                        (
                                                        {formatNumberWithUnit(
                                                            planetWagePerEdu?.[edu] ?? DEFAULT_WAGE_PER_EDU,
                                                            'currency',
                                                            planetId,
                                                        )}
                                                        )
                                                    </span>
                                                </span>
                                            </div>
                                        );
                                    })}
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
