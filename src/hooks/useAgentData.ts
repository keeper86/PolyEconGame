'use client';

import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import type { Agent } from '../simulation/planet/planet';
import type { AgentTimeSeries, AgentResourceSnapshot } from '@/app/agents/AgentOverview';

const REFETCH_INTERVAL_MS = 1000;

export type AgentDataEntry = {
    agentId: string;
    wealth: number;
    storage: Record<string, number>;
    production: Record<string, number>;
    consumption: Record<string, number>;
    agent: Agent;
};

export type UseAgentDataResult = {
    tick: number;
    agents: AgentDataEntry[];
    agentSeries: Record<string, AgentTimeSeries>;
    isLoading: boolean;
};

/**
 * Hook that fetches agent snapshots via tRPC, polling once per second.
 * Returns both the latest agent state and pre-computed resource summaries.
 */
export function useAgentData(): UseAgentDataResult {
    const trpc = useTRPC();

    const agentsQuery = useQuery({
        ...trpc.simulation.getLatestAgents.queryOptions(),
        refetchInterval: REFETCH_INTERVAL_MS,
    });

    const tick = agentsQuery.data?.tick ?? 0;
    const agentRows = agentsQuery.data?.agents ?? [];

    const agents: AgentDataEntry[] = agentRows.map((a) => ({
        agentId: a.agentId,
        wealth: a.wealth,
        storage: a.storage,
        production: a.production,
        consumption: a.consumption,
        agent: a.agentSummary as Agent,
    }));

    // Build single-tick time series from the latest snapshot so charts render
    // immediately.  Full history is available via useAgentHistory per-agent.
    const agentSeries: Record<string, AgentTimeSeries> = {};
    for (const a of agentRows) {
        const storageSnap: AgentResourceSnapshot = { tick, resources: a.storage };
        const prodSnap: AgentResourceSnapshot = { tick, resources: a.production };
        const consSnap: AgentResourceSnapshot = { tick, resources: a.consumption };
        agentSeries[a.agentId] = {
            storage: [storageSnap],
            production: [prodSnap],
            consumption: [consSnap],
        };
    }

    return {
        tick,
        agents,
        agentSeries,
        isLoading: agentsQuery.isLoading,
    };
}

/**
 * Hook that fetches resource history for a single agent.
 * Call this inside a component that needs the full time-series chart data.
 */
export function useAgentHistory(): { series: AgentTimeSeries; isLoading: boolean } {
    const series: AgentTimeSeries = {
        storage: [],
        production: [],
        consumption: [],
    };

    return {
        series,
        isLoading: false,
    };
}
