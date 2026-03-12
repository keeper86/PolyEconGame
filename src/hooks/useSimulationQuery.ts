/**
 * hooks/useSimulationQuery.ts
 *
 * Thin wrapper around `useQuery` for live simulation polling.
 *
 * Problem: `refetchInterval` is entirely independent of the retry/error
 * system.  Without a guard, a failing query will fire a new request every
 * second forever — even after retries are exhausted — because the interval
 * timer is never stopped on error.
 *
 * Solution: pass `refetchInterval` as a function that returns `false` once
 * the query's `fetchFailureCount` has reached MAX_RETRIES.  At that point the
 * interval stops and TanStack Query's normal retry back-off takes over (which
 * does stop after MAX_RETRIES).
 *
 * Usage:
 *   const { data, isLoading } = useSimulationQuery(
 *     trpc.simulation.getPlanetFood.queryOptions({ planetId }),
 *   );
 */

import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

export const SIMULATION_MAX_RETRIES = 3;
export const SIMULATION_REFETCH_INTERVAL_MS = 1_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SimulationQueryOptions<TData, TError> = Omit<
    UseQueryOptions<TData, TError, TData, any>,
    'refetchInterval' | 'retry'
> & {
    /** Override the polling interval (ms). Defaults to SIMULATION_REFETCH_INTERVAL_MS. */
    refetchIntervalMs?: number;
};

export function useSimulationQuery<TData, TError = Error>(
    options: SimulationQueryOptions<TData, TError>,
): UseQueryResult<TData, TError> {
    const { refetchIntervalMs = SIMULATION_REFETCH_INTERVAL_MS, ...rest } = options;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return useQuery<TData, TError, TData, any>({
        ...rest,
        retry: SIMULATION_MAX_RETRIES,
        refetchInterval: (query) =>
            query.state.fetchFailureCount >= SIMULATION_MAX_RETRIES ? false : refetchIntervalMs,
    });
}
