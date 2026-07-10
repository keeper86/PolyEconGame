'use client';

import { useAgentId } from '@/hooks/useAgentId';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import type { AgentPlanetDetail } from '@/server/controller/simulation';
import type { AgentPlanetAssets } from '@/simulation/planet/planet';
import type { ProductionFacility } from '@/simulation/planet/facility';
import { useParams } from 'next/navigation';
import { useActionOverlays, applyFacilityOverlays, useResolveActionOverlays } from '@/hooks/useActionOverlay';
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

    // Apply optimistic overlays for confirmed but not-yet-snapshot actions
    const overlays = useActionOverlays(agentId, planetId);
    const resolveOverlays = useResolveActionOverlays();
    const prevResolvedRef = useRef<Set<string>>(new Set());

    const assets = useMemo(() => {
        if (!baseAssets) {
            return null;
        }
        // Clone to avoid mutating the cache
        const merged: AgentPlanetAssets = {
            ...baseAssets,
            productionFacilities: applyFacilityOverlays(baseAssets.productionFacilities, overlays, planetId),
        };
        return merged;
    }, [baseAssets, overlays, planetId]);

    // GC overlays in a useEffect — never inside useMemo (that would cause
    // React's "Cannot update a component while rendering a different component").
    useEffect(() => {
        if (!baseAssets) {
            return;
        }
        const realFacilities = baseAssets.productionFacilities;
        const realIds = new Set<string>(realFacilities.map((f: ProductionFacility) => f.id));
        const prev = prevResolvedRef.current;
        if (prev.size !== realIds.size || ![...realIds].every((id) => prev.has(id))) {
            prevResolvedRef.current = realIds;
            resolveOverlays(agentId, planetId, realIds, realFacilities);
        }
    }, [baseAssets, agentId, planetId, resolveOverlays]);

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
