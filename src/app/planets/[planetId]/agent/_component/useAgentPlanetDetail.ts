'use client';

import { useAgentId } from '@/hooks/useAgentId';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import type { AgentPlanetAssets } from '@/simulation/planet/planet';
import { useParams } from 'next/navigation';

export type AgentPlanetDetail = {
    agentId: string;
    agentName: string;
    planetId: string;
    automateWorkerAllocation: boolean;
    assets: AgentPlanetAssets;
    allPlanetDeposits: Record<string, number>;
};

export type UseAgentPlanetDetailResult = {
    agentId: string;
    planetId: string;
    detail: AgentPlanetDetail | null;
    assets: AgentPlanetAssets | null;
    tick: number;
    isLoading: boolean;
    hasNoAssets: boolean;
    isOwnAgent: boolean;
    myAgentId: ReturnType<typeof useAgentId>;
};

export function useAgentPlanetDetail(): UseAgentPlanetDetailResult {
    const params = useParams<'/planets/[planetId]/agent/[agentId]'>();
    const agentId = params.agentId;
    const planetId = params.planetId;
    const trpc = useTRPC();
    const myAgentId = useAgentId();

    const { data, isLoading } = useSimulationQuery(
        trpc.simulation.getAgentPlanetDetail.queryOptions({ agentId, planetId }),
    );

    const detail = (data?.detail as AgentPlanetDetail | null) ?? null;

    return {
        agentId,
        planetId,
        detail,
        assets: detail?.assets ?? null,
        tick: data?.tick ?? 0,
        isLoading,
        hasNoAssets: !isLoading && data !== undefined && detail === null,
        isOwnAgent: myAgentId.agentId === agentId,
        myAgentId,
    };
}
