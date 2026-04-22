'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import AutomationPanel from '@/app/planets/[planetId]/agent/_component/AutomationPanel';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import WorkerAllocationPanel from '@/app/planets/[planetId]/agent/_component/WorkerAllocationPanel';
import WorkforceDemographyPanel from '@/app/planets/[planetId]/agent/_component/WorkforceDemographyPanel';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { AgentMetricChart } from '@/components/client/AgentMetricChart';
import { Card, CardContent } from '@/components/ui/card';
import { formatNumbers } from '@/lib/utils';
import { DEFAULT_WAGE_PER_EDU } from '@/simulation/financial/financialTick';
import { educationLevelKeys } from '@/simulation/population/education';
import type { EducationLevelType } from '@/simulation/population/education';
import { Coins } from 'lucide-react';

export default function WorkforcePage() {
    const { agentId, planetId, detail, assets, isLoading, hasNoAssets, isOwnAgent, myAgentId } = useAgentPlanetDetail();

    return (
        <>
            <Card className='mt-4'>
                <CardContent className='px-3 pb-3 space-y-3'>
                    <div>
                        <div className='flex items-center gap-1 text-xs text-muted-foreground mb-1'>
                            <Coins className='h-3 w-3' />
                            Wage per worker / tick
                        </div>
                        <div className='grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5'>
                            {educationLevelKeys.map((edu) => {
                                const wage = DEFAULT_WAGE_PER_EDU;
                                return (
                                    <div key={edu} className='flex items-baseline justify-between text-xs gap-2'>
                                        <span className='text-muted-foreground capitalize'>{edu}</span>
                                        <span className='tabular-nums font-medium'>{formatNumbers(wage)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </CardContent>
            </Card>
            <AgentAccessGuard
                agentId={agentId}
                agentName={detail?.agentName ?? 'Agent'}
                isLoading={myAgentId.isLoading}
                isOwnAgent={isOwnAgent}
            >
                {hasNoAssets ? (
                    <NoAssetsMessage planetName={planetId} agentId={agentId} isOwnAgent={isOwnAgent} />
                ) : !isLoading && assets ? (
                    <div className='space-y-6'>
                        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 mt-4'>
                            <AgentMetricChart agentId={agentId} granularity='monthly' metric='totalWorkers' />
                            <AgentMetricChart agentId={agentId} granularity='monthly' metric='wages' />
                        </div>
                        <WorkforceDemographyPanel
                            allocatedWorkers={assets.allocatedWorkers as Record<EducationLevelType, number>}
                            workforceDemography={assets.workforceDemography}
                            unusedWorkers={undefined}
                            unusedWorkerFraction={undefined}
                            overqualifiedMatrix={undefined}
                            deathsThisMonth={assets.deaths?.thisMonth}
                            deathsPrevMonth={assets.deaths?.prevMonth}
                            disabilitiesThisMonth={assets.disabilities?.thisMonth}
                            disabilitiesPrevMonth={assets.disabilities?.prevMonth}
                        />
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
                    </div>
                ) : (
                    <div className='text-sm text-muted-foreground'>Loading…</div>
                )}
            </AgentAccessGuard>
        </>
    );
}
