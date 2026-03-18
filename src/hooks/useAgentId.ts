/**
 * hooks/useAgentId.ts
 *
 * Returns the current user's agentId from the server via TanStack Query so
 * that changes (e.g. founding a new company) are immediately visible without
 * requiring a logout / login cycle to rewrite the session JWT.
 *
 * Consumers can optimistically react to changes by invalidating the underlying
 * query key:
 *
 *   queryClient.invalidateQueries({ queryKey: trpc.getUser.queryKey() });
 */

import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

export function useAgentId(): string | null {
    const { status } = useSession();
    const trpc = useTRPC();

    const { data } = useQuery(
        trpc.getUser.queryOptions({ userId: undefined }, { enabled: status === 'authenticated' }),
    );

    return data?.agentId ?? null;
}
