'use client';

import { useAgentId } from '@/hooks/useAgentId';
import { usePendingActions, useRemovePendingById, useRemovePendingByKey } from '@/hooks/useActionOverlay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import type { AgentPlanetDetail } from '@/server/controller/simulation';
import type { ConsumptionShipInfo } from '@/simulation/market/consumptionShipInfo';
import type { AgentPlanetAssets } from '@/simulation/planet/planet';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';

export type UseAgentPlanetDetailResult = {
    agentId: string;
    planetId: string;
    detail: AgentPlanetDetail | null;
    assets: AgentPlanetAssets | null;
    ships: ConsumptionShipInfo[];
    tick: number;
    isLoading: boolean;
    hasNoAssets: boolean;
    isOwnAgent: boolean;
    isOwnAgentUnknown: boolean;
    isAuthenticatedWithoutAgentId: boolean;
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
    const baseAssets = detail?.assets ?? null;

    // Pending actions for this agent/planet
    const pendingActions = usePendingActions(agentId, planetId);
    const removeById = useRemovePendingById();
    const removeByKey = useRemovePendingByKey();

    // Expose the real facilities directly (no fake data merging)
    const assets = useMemo(() => {
        if (!baseAssets) {
            return null;
        }
        return baseAssets as AgentPlanetAssets;
    }, [baseAssets]);

    // Resolve pending actions by tick comparison: if the snapshot tick has
    // advanced past the action's triggerTick, the action was processed.
    const snapshotTick = data?.tick;
    const prevTickRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (!snapshotTick) {
            return;
        }
        // Only run on actual tick advance (not on first mount / initial data)
        if (prevTickRef.current === undefined) {
            prevTickRef.current = snapshotTick;
            return;
        }
        prevTickRef.current = snapshotTick;

        for (const action of pendingActions) {
            if (snapshotTick > action.triggerTick) {
                if (action.facilityKey) {
                    removeByKey(agentId, planetId, action.facilityKey);
                } else if (action.facilityId) {
                    removeById(agentId, planetId, action.facilityId, action.type);
                } else if (action.loanId) {
                    removeByKey(agentId, planetId, action.loanId);
                }
            }
        }
    }, [snapshotTick, pendingActions, removeById, removeByKey, agentId, planetId]);

    const ships = (detail?.ships ?? []) as ConsumptionShipInfo[];

    return {
        agentId,
        planetId,
        detail,
        assets,
        ships,
        tick: data?.tick ?? 0,
        isLoading,
        hasNoAssets: !isLoading && data !== undefined && detail === null,
        isOwnAgent: myAgentId.agentId === agentId,
        isOwnAgentUnknown: myAgentId.agentId === null && myAgentId.status !== 'authenticated',
        isAuthenticatedWithoutAgentId: myAgentId.agentId === null && myAgentId.status === 'authenticated',
        myAgentId,
    };
}
