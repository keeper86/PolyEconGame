import { useTRPC } from '@/lib/trpc';
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
 * Polls the current simulation tick. Returns the tick number or 0 if unknown.
 * Does NOT trigger query invalidations — that is handled by the single
 * <SimulationTickPoller /> component rendered once in AppProviders.
 */
export function useSimulationTick(): number {
    const loggedIn = useSession().status === 'authenticated';
    const trpc = useTRPC();

    const { data } = useQuery({
        ...trpc.simulation.getCurrentTick.queryOptions(),
        refetchInterval: 1000,
        staleTime: Infinity,
        enabled: loggedIn,
    });

    return data?.tick ?? 0;
}

/**
 * Renders exactly once in the app tree (inside AppProviders).
 * Listens for tick advances and invalidates all stale simulation queries
 * except the heartbeat itself.
 */
export function SimulationTickPoller() {
    const loggedIn = useSession().status === 'authenticated';
    const queryClient = useQueryClient();
    const trpc = useTRPC();

    const { data } = useQuery({
        ...trpc.simulation.getCurrentTick.queryOptions(),
        refetchInterval: 1000,
        staleTime: Infinity,
        enabled: loggedIn,
    });

    useEffect(() => {
        if (!data) {
            return;
        }

        void queryClient.invalidateQueries({
            predicate: (query) => {
                // tRPC generates nested query keys: [['simulation', 'procedureName'], ...]
                const path = Array.isArray(query.queryKey[0]) ? query.queryKey[0] : query.queryKey;
                // Only invalidate simulation queries, but NOT the currentTick heartbeat itself
                return path[0] === 'simulation' && path[1] !== 'getCurrentTick';
            },
        });
    }, [data, queryClient]);

    return null;
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
