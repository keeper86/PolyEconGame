import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

export type UseAgentIdResult = {
    agentId: string | null;
    planetId: string | null;
    isLoading: boolean;
};

export function useAgentId(): UseAgentIdResult {
    const { status } = useSession();
    const trpc = useTRPC();

    const { data, isLoading } = useQuery(
        trpc.getUser.queryOptions({ userId: undefined }, { enabled: status === 'authenticated' }),
    );

    return {
        agentId: data?.agentId ?? null,
        planetId: data?.planetId ?? null,
        isLoading: status === 'loading' || (status === 'authenticated' && isLoading),
    };
}
