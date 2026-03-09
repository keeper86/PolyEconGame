'use client';

import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import type { Planet } from '../simulation/planet/planet';

const REFETCH_INTERVAL_MS = 1000;

export type PlanetDataEntry = {
    planetId: string;
    populationTotal: number;
    planet: Planet;
};

export type PlanetHistoryEntry = {
    tick: number;
    value: number;
};

export type UsePlanetDataResult = {
    tick: number;
    planets: PlanetDataEntry[];
    popSeries: Record<string, PlanetHistoryEntry[]>;
    isLoading: boolean;
};

/**
 * Hook that fetches planet snapshots via tRPC, polling once per second.
 * Each component using this hook makes its own independent tRPC request so
 * only the data required by the planets view is transferred.
 */
export function usePlanetData(): UsePlanetDataResult {
    const trpc = useTRPC();

    const planetsQuery = useQuery({
        ...trpc.simulation.getLatestPlanets.queryOptions(),
        refetchInterval: REFETCH_INTERVAL_MS,
    });

    const tick = planetsQuery.data?.tick ?? 0;
    const planets: PlanetDataEntry[] = (planetsQuery.data?.planets ?? []).map((p) => ({
        planetId: p.planetId,
        populationTotal: p.populationTotal,
        planet: p.snapshot as Planet,
    }));

    // Build population series from the latest snapshot totals.
    // Full historical series are available via usePlanetHistory per-planet.
    const popSeries: Record<string, PlanetHistoryEntry[]> = {};
    for (const p of planets) {
        popSeries[p.planetId] = [{ tick, value: p.populationTotal }];
    }

    // Dev-only: log the raw tRPC response so we can inspect server payloads
    // in the browser when running `next dev`.
    if (process.env.NODE_ENV === 'development') {
        try {
            console.debug('[client] planetsQuery.data', planetsQuery.data);
        } catch (_e) {
            // ignore logging issues
        }
    }

    return {
        tick,
        planets,
        popSeries,
        isLoading: planetsQuery.isLoading,
    };
}

/**
 * Hook that fetches population history for a single planet.
 * Call this inside a component that needs the time-series chart data.
 */
export function usePlanetHistory(
    planetId: string,
    _limit = 200,
): { history: PlanetHistoryEntry[]; isLoading: boolean } {
    // Historical snapshots have been removed. Return an empty series.
    return { history: [], isLoading: false };
}
