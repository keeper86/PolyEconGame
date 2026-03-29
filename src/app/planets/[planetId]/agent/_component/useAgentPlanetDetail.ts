'use client';

import { useAgentId } from '@/hooks/useAgentId';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import type { ProductionFacility, StorageFacility } from '@/simulation/planet/storage';
import type { EducationLevelType } from '@/simulation/population/education';
import { useParams } from 'next/navigation';
import type { WorkforceDemography } from './workforce-summary';

export type AgentPlanetAssets = {
    productionFacilities: ProductionFacility[];
    storageFacility: StorageFacility;
    allocatedWorkers: Record<EducationLevelType, number>;
    deaths?: { thisMonth: Record<EducationLevelType, number>; prevMonth: Record<EducationLevelType, number> };
    disabilities?: { thisMonth: Record<EducationLevelType, number>; prevMonth: Record<EducationLevelType, number> };
    retirements?: { thisMonth: Record<EducationLevelType, number>; prevMonth: Record<EducationLevelType, number> };
    workforceDemography?: WorkforceDemography;
    deposits: number;
    loans?: number;
    lastWageBill?: number;
    market?: {
        sell: {
            [resourceName: string]: {
                offerPrice?: number;
                offerQuantity?: number;
                offerRetainment?: number;
                lastSold?: number;
                lastRevenue?: number;
                priceDirection?: number;
                automated?: boolean;
            };
        };
        buy: {
            [resourceName: string]: {
                bidPrice?: number;
                bidStorageTarget?: number;
                lastBought?: number;
                lastSpent?: number;
                storageFullWarning?: boolean;
                depositScaleWarning?: 'scaled' | 'dropped';
                automated?: boolean;
            };
        };
    };
};

export type AgentPlanetDetail = {
    agentId: string;
    agentName: string;
    planetId: string;
    automateWorkerAllocation: boolean;
    assets: AgentPlanetAssets;
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
