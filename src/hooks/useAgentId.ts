import { useSession } from 'next-auth/react';

export type UseAgentIdResult = {
    agentId: string | null;
    planetId: string | null;
    isLoading: boolean;
    status: 'loading' | 'authenticated' | 'unauthenticated';
};

export function useAgentId(): UseAgentIdResult {
    const { data: session, status } = useSession();

    return {
        agentId: session?.user?.agentId ?? null,
        planetId: session?.user?.planetId ?? null,
        isLoading: status === 'loading',
        status,
    };
}
