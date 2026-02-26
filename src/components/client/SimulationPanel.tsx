'use client';
import PlanetDetails from '@/components/client/PlanetDetails';
import AgentOverview from '@/components/client/AgentOverview';
import { useGameState } from '@/hooks/useGameState';
import React from 'react';

export default function SimulationPanel(): React.ReactElement {
    const { state, popSeries, agentSeries } = useGameState();

    return (
        <div className='space-y-4'>
            {/* Agents overview placed above the planets list */}
            {state?.agents && state.agents.length > 0 ? (
                <AgentOverview agents={state.agents} timeSeries={agentSeries} />
            ) : null}

            {(state?.planets ?? []).map((p) => (
                <PlanetDetails
                    key={p.id}
                    planet={p}
                    history={popSeries[p.id] ?? []}
                    latestPopulation={p.population}
                    agents={state?.agents?.filter((a) => a.associatedPlanetId === p.id) ?? []}
                />
            ))}
        </div>
    );
}
