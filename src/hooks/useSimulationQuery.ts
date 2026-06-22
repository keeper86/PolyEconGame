import { trpcClient } from '@/lib/trpc';
import {
    keepPreviousData,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
    type UseQueryResult,
} from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

export const SIMULATION_MAX_RETRIES = 3;

/**
 * Pushes the current simulation tick and invalidates all simulation queries
 * on tick advance. Shares the query cache with all consumers of this hook,
 * so there's only ever one network request.
 */
export function useSimulationTick(): number {
    const loggedIn = useSession().status === 'authenticated';
    const queryClient = useQueryClient();

    const { data } = useQuery({
        queryKey: ['simulation', 'currentTick'],
        queryFn: () => trpcClient.simulation.getCurrentTick.query(),
        refetchInterval: 1000,
        staleTime: Infinity,
        enabled: loggedIn,
    });

    useEffect(() => {
        if (!data) {
            return;
        }

        void queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] !== 'simulation' || query.queryKey[1] !== 'currentTick',
        });
    }, [data, queryClient]);

    return data?.tick ?? 0;
}

type SimulationQueryOptions<TData, TError> = Omit<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    UseQueryOptions<TData, TError, TData, any>,
    'refetchInterval' | 'retry' | 'placeholderData' | 'staleTime'
>;

export function useSimulationQuery<TData, TError = Error>(
    options: SimulationQueryOptions<TData, TError>,
): UseQueryResult<TData, TError> {
    const loggedIn = useSession().status === 'authenticated';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return useQuery<TData, TError, TData, any>({
        ...options,
        retry: SIMULATION_MAX_RETRIES,
        placeholderData: keepPreviousData,
        staleTime: Infinity,
        enabled: loggedIn && !!options.queryKey && (options.enabled ?? true),
    });
}
