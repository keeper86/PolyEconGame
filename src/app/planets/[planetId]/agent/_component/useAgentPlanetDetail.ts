'use client';

import { useAgentId } from '@/hooks/useAgentId';
import {
    usePendingActions,
    useRemovePendingById,
    useRemovePendingByKey,
    resolvePendingActions,
} from '@/hooks/useActionOverlay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import type { AgentPlanetDetail } from '@/server/controller/simulation';
import type { AgentPlanetAssets } from '@/simulation/planet/planet';
import type { ProductionFacility } from '@/simulation/planet/facility';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';

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

    // GC resolved pending actions whenever the facility list changes.
    // This runs after every snapshot update that changes the facility set.
    const prevAssetVersionRef = useRef<string | null>(null);

    useEffect(() => {
        if (!baseAssets) {
            return;
        }
        const realFacilities: ProductionFacility[] = baseAssets.productionFacilities;

        // Compute a quick version hash to detect actual changes (skip if same)
        const versionHash = realFacilities
            .map((f) => `${f.id}:${f.scale}:${f.maxScale}:${f.construction !== null}`)
            .join('|');
        if (prevAssetVersionRef.current === versionHash) {
            return;
        }
        prevAssetVersionRef.current = versionHash;

        // Resolve pending actions against the real snapshot facilities
        const remaining = resolvePendingActions(pendingActions, realFacilities);
        if (remaining.length === pendingActions.length) {
            return; // nothing resolved
        }

        // Identify which actions were resolved and remove them
        const resolved = pendingActions.filter((a) => !remaining.includes(a));
        for (const action of resolved) {
            if (action.type === 'build' && action.facilityKey) {
                removeByKey(agentId, planetId, action.facilityKey);
            } else if (action.facilityId) {
                removeById(agentId, planetId, action.facilityId);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baseAssets, agentId, planetId, removeById, removeByKey]);

    return {
        agentId,
        planetId,
        detail,
        assets,
        tick: data?.tick ?? 0,
        isLoading,
        hasNoAssets: !isLoading && data !== undefined && detail === null,
        isOwnAgent: myAgentId.agentId === agentId,
        myAgentId,
    };
}
