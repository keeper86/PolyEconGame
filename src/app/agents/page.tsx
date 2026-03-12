'use client';

import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import AgentSummaryCard from '@/app/agents/AgentSummaryCard';
import { Page } from '@/components/client/Page';
import { useTRPC } from '@/lib/trpc';

export default function AgentsPage() {
    const trpc = useTRPC();

    const { data, isLoading } = useSimulationQuery(trpc.simulation.getAgentListSummaries.queryOptions());

    const tick = data?.tick ?? 0;
    const agents = data?.agents ?? [];

    return (
        <Page title='Agents'>
            {!isLoading && tick > 0 && agents.length > 0 ? (
                <div className='grid grid-cols-1 gap-4'>
                    {agents.map((a) => (
                        <AgentSummaryCard key={a.agentId} summary={a} />
                    ))}
                </div>
            ) : (
                <div className='text-sm text-muted-foreground'>Waiting for simulation data…</div>
            )}
        </Page>
    );
}
