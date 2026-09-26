import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

export const MESSAGE_POLL_INTERVAL_MS = 10000;

const MESSAGE_QUERY_ROOT = 'message';
const COUNT_POLLED_PROCEDURES = new Set(['getUnreadCount']);
const LIST_POLLED_PROCEDURES = new Set(['listInbox', 'listSent']);

const messageProcedure = (queryKey: readonly unknown[]): string | null => {
    const path = Array.isArray(queryKey[0]) ? (queryKey[0] as unknown[]) : queryKey;
    if (path[0] !== MESSAGE_QUERY_ROOT || typeof path[1] !== 'string') {
        return null;
    }
    return path[1];
};

const matchesProcedure = (queryKey: readonly unknown[], procedures: Set<string>): boolean => {
    const procedure = messageProcedure(queryKey);
    return procedure !== null && procedures.has(procedure);
};

export const isMessageQuery = (queryKey: readonly unknown[]): boolean => messageProcedure(queryKey) !== null;

export const isCountPolledMessageQuery = (queryKey: readonly unknown[]): boolean =>
    matchesProcedure(queryKey, COUNT_POLLED_PROCEDURES);

export const isListPolledMessageQuery = (queryKey: readonly unknown[]): boolean =>
    matchesProcedure(queryKey, LIST_POLLED_PROCEDURES);

const invalidateMessageQueries = (queryClient: QueryClient): void => {
    void queryClient.invalidateQueries({
        predicate: (query) => isMessageQuery(query.queryKey),
    });
};

const invalidateByProcedure = (queryClient: QueryClient, procedures: Set<string>): void => {
    void queryClient.invalidateQueries({
        predicate: (query) => matchesProcedure(query.queryKey, procedures),
    });
};

function useVisiblePolling(enabled: boolean, procedures: Set<string>): void {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!enabled) {
            return;
        }
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                invalidateByProcedure(queryClient, procedures);
            }
        }, MESSAGE_POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [enabled, queryClient, procedures]);
}

export function useMessageCountPolling(): void {
    useVisiblePolling(useSession().status === 'authenticated', COUNT_POLLED_PROCEDURES);
}

export function useMessageListPolling(): void {
    useVisiblePolling(useSession().status === 'authenticated', LIST_POLLED_PROCEDURES);
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

export function useMessageBody(messageId: string | null): string | null {
    const loggedIn = useSession().status === 'authenticated';
    const trpc = useTRPC();

    const { data } = useQuery({
        ...trpc.message.getMessage.queryOptions({ messageId: messageId ?? '' }),
        enabled: loggedIn && messageId !== null,
    });

    return data?.body ?? null;
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
