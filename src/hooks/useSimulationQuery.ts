import { keepPreviousData, useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

export const SIMULATION_MAX_RETRIES = 3;
export const SIMULATION_REFETCH_INTERVAL_MS = process.env.TICK_INTERVAL_MS
    ? parseInt(process.env.TICK_INTERVAL_MS, 10)
    : 2000;

type SimulationQueryOptions<TData, TError> = Omit<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    UseQueryOptions<TData, TError, TData, any>,
    'refetchInterval' | 'retry' | 'placeholderData'
> & {
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

        placeholderData: keepPreviousData,
        refetchInterval: (query) =>
            query.state.fetchFailureCount > SIMULATION_MAX_RETRIES ? false : refetchIntervalMs,
        enabled: loggedIn && !!options.queryKey && (rest.enabled ?? true),
    });
}
