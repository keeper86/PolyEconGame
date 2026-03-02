'use client';

import { useQuery } from '@tanstack/react-query';
import AgentSummaryCard from '@/app/agents/AgentSummaryCard';
import { Page } from '@/components/client/Page';
import TickDisplay from '@/components/client/TickDisplay';
import { useTRPC } from '@/lib/trpc';

const REFETCH_INTERVAL_MS = 1000;

export default function AgentsPage() {
    const trpc = useTRPC();

    const { data, isLoading } = useQuery({
        ...trpc.simulation.getAgentListSummaries.queryOptions(),
        refetchInterval: REFETCH_INTERVAL_MS,
    });

    const tick = data?.tick ?? 0;
    const agents = data?.agents ?? [];

    return (
        <Page title='Agents'>
            <div className='mb-4'>
                <TickDisplay tick={tick} />
            </div>

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
