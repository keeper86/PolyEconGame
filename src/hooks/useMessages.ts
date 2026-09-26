import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

const UNREAD_POLL_INTERVAL_MS = 5000;

export const isMessageQuery = (queryKey: readonly unknown[]): boolean => {
    const path = Array.isArray(queryKey[0]) ? (queryKey[0] as unknown[]) : queryKey;
    return path[0] === 'message';
};

export function useUnreadMessageCount(): number {
    const loggedIn = useSession().status === 'authenticated';
    const trpc = useTRPC();

    const { data } = useQuery({
        ...trpc.message.getUnreadCount.queryOptions(),
        refetchInterval: UNREAD_POLL_INTERVAL_MS,
        enabled: loggedIn,
    });

    return data?.count ?? 0;
}

export function useSendMessage() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    return useMutation(
        trpc.message.sendMessage.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    predicate: (query) => isMessageQuery(query.queryKey),
                });
            },
        }),
    );
}

export function useMarkRead() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    return useMutation(
        trpc.message.markRead.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    predicate: (query) => isMessageQuery(query.queryKey),
                });
            },
        }),
    );
}

export function useMarkAllRead() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    return useMutation(
        trpc.message.markAllRead.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    predicate: (query) => isMessageQuery(query.queryKey),
                });
            },
        }),
    );
}
