'use client';

import AgentOverview from '@/app/agents/AgentOverview';
import { Page } from '@/components/client/Page';
import SecondTicker from '@/components/client/SecondTicker';
import { useAgentData, useAgentHistory } from '@/hooks/useAgentData';
import type { AgentTimeSeries } from '@/app/agents/AgentOverview';
import type { Agent } from '@/simulation/planet';

/**
 * Renders a single agent card with its own history fetched via tRPC.
 * By isolating the hook call to a per-agent component we respect React's
 * rules of hooks while allowing each agent to independently load its data.
 */
function AgentWithHistory({ agent, fallbackSeries }: { agent: Agent; fallbackSeries: AgentTimeSeries }) {
    const { series } = useAgentHistory(agent.id);
    const timeSeries = series.storage.length > 0 ? series : fallbackSeries;
    return <AgentOverview agents={[agent]} timeSeries={{ [agent.id]: timeSeries }} />;
}

export default function AgentsPage() {
    const { agents, agentSeries, isLoading, tick } = useAgentData();

    return (
        <Page title='Agents'>
            <div className='mb-4'>
                <SecondTicker />
            </div>

            {!isLoading && tick > 0 && agents.length > 0 ? (
                <div className='space-y-4'>
                    {agents.map((a) => (
                        <AgentWithHistory
                            key={a.agentId}
                            agent={a.agent}
                            fallbackSeries={agentSeries[a.agentId] ?? { storage: [], production: [], consumption: [] }}
                        />
                    ))}
                </div>
            ) : (
                <div className='text-sm text-muted-foreground'>Waiting for simulation data…</div>
            )}
        </Page>
    );
}
