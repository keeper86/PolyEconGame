import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

export const MESSAGE_POLL_INTERVAL_MS = 5000;

export const isMessageQuery = (queryKey: readonly unknown[]): boolean => {
    const path = Array.isArray(queryKey[0]) ? (queryKey[0] as unknown[]) : queryKey;
    return path[0] === 'message';
};

const invalidateMessageQueries = (queryClient: QueryClient): void => {
    void queryClient.invalidateQueries({
        predicate: (query) => isMessageQuery(query.queryKey),
    });
};

export function useMessagePolling(): void {
    const loggedIn = useSession().status === 'authenticated';
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!loggedIn) {
            return;
        }
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                invalidateMessageQueries(queryClient);
            }
        }, MESSAGE_POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [loggedIn, queryClient]);
}

export function useUnreadMessageCount(): number {
    const loggedIn = useSession().status === 'authenticated';
    const trpc = useTRPC();

    const { data } = useQuery({
        ...trpc.message.getUnreadCount.queryOptions(),
        enabled: loggedIn,
    });

    return data?.count ?? 0;
}

export function useSendMessage() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    return useMutation(
        trpc.message.sendMessage.mutationOptions({
            onSuccess: () => invalidateMessageQueries(queryClient),
        }),
    );
}

export function useMarkRead() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    return useMutation(
        trpc.message.markRead.mutationOptions({
            onSuccess: () => invalidateMessageQueries(queryClient),
        }),
    );
}

export function useMarkAllRead() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    return useMutation(
        trpc.message.markAllRead.mutationOptions({
            onSuccess: () => invalidateMessageQueries(queryClient),
        }),
    );
}

export function useDeleteMessage() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    return useMutation(
        trpc.message.deleteMessage.mutationOptions({
            onSuccess: () => invalidateMessageQueries(queryClient),
        }),
    );
}

export function useDeleteMessages() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    return useMutation(
        trpc.message.deleteMessages.mutationOptions({
            onSuccess: () => invalidateMessageQueries(queryClient),
        }),
    );
}
