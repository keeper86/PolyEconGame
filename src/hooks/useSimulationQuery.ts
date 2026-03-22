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
 * the query's `fetchFailureCount` exceeds SIMULATION_MAX_RETRIES.  At that
 * point polling stops; TanStack Query will not automatically start new
 * fetches unless something explicitly triggers a refetch (e.g. focus,
 * reconnect, or a manual reset), and per-request retries remain bounded by
 * SIMULATION_MAX_RETRIES.
 *
 * Note on the threshold: with `retry: N`, TanStack Query makes 1 initial
 * attempt plus N retries, so `fetchFailureCount` reaches N+1 when retries
 * are exhausted.  The guard uses `> SIMULATION_MAX_RETRIES` (i.e. >= N+1)
 * so polling stops at exactly that point, not one failure early.
 *
 * Usage:
 *   const { data, isLoading } = useSimulationQuery(
 *     trpc.simulation.getPlanetFood.queryOptions({ planetId }),
 *   );
 */

import { keepPreviousData, useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

export const SIMULATION_MAX_RETRIES = 3;
export const SIMULATION_REFETCH_INTERVAL_MS = 900;

type SimulationQueryOptions<TData, TError> = Omit<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    UseQueryOptions<TData, TError, TData, any>,
    'refetchInterval' | 'retry' | 'placeholderData'
> & {
    /** Override the polling interval (ms). Defaults to SIMULATION_REFETCH_INTERVAL_MS. */
    refetchIntervalMs?: number;
};

export function useSimulationQuery<TData, TError = Error>(
    options: SimulationQueryOptions<TData, TError>,
): UseQueryResult<TData, TError> {
    const loggedIn = useSession().status === 'authenticated';
    const { refetchIntervalMs = SIMULATION_REFETCH_INTERVAL_MS, ...rest } = options;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return useQuery<TData, TError, TData, any>({
        ...rest,
        retry: SIMULATION_MAX_RETRIES,
        // Keep the last successfully fetched data visible while a new fetch
        // is in-flight — covers both regular polling ticks and query-key
        // changes (e.g. switching group mode or skill filter).
        placeholderData: keepPreviousData,
        refetchInterval: (query) =>
            query.state.fetchFailureCount > SIMULATION_MAX_RETRIES ? false : refetchIntervalMs,
        enabled: loggedIn && !!options.queryKey,
    });
}
