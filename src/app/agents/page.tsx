'use client';

import AgentOverview from '@/components/client/AgentOverview';
import { Page } from '@/components/client/Page';
import SecondTicker from '@/components/client/SecondTicker';
import { useGameState } from '@/hooks/useGameState';

export default function AgentsPage() {
    const { state, agentSeries } = useGameState();

    return (
        <Page title='Agents'>
            <div className='mb-4'>
                <SecondTicker />
            </div>

            {state?.agents && state.agents.length > 0 ? (
                <AgentOverview agents={state.agents} timeSeries={agentSeries} />
            ) : (
                <div className='text-sm text-muted-foreground'>Waiting for simulation data…</div>
            )}
        </Page>
    );
}
