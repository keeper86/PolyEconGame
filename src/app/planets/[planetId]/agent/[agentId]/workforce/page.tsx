'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import WorkerAllocationPanel from '@/app/planets/[planetId]/agent/_component/WorkerAllocationPanel';
import WorkforceDemographyPanel from '@/app/planets/[planetId]/agent/_component/WorkforceDemographyPanel';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';

export default function WorkforcePage() {
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
                    <WorkforceDemographyPanel
                        allocatedWorkers={assets.allocatedWorkers}
                        workforceDemography={assets.workforceDemography}
                        unusedWorkers={undefined}
                        unusedWorkerFraction={undefined}
                        overqualifiedMatrix={undefined}
                        deathsThisMonth={assets.deaths?.thisMonth}
                        deathsPrevMonth={assets.deaths?.prevMonth}
                        disabilitiesThisMonth={assets.disabilities?.thisMonth}
                        disabilitiesPrevMonth={assets.disabilities?.prevMonth}
                        retirementsThisMonth={assets.retirements?.thisMonth}
                        retirementsPrevMonth={assets.retirements?.prevMonth}
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
    );
}
