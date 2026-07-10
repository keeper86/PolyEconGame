'use client';

import { TourProvider } from '@/components/tour/TourContext';
import { trpcClient, TRPCProvider } from '@/lib/trpc';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SimulationTickPoller } from '@/hooks/useSimulationQuery';
import { PendingActionProvider } from '@/hooks/useActionOverlay';
import type { Session } from 'next-auth';
import { SessionProvider } from 'next-auth/react';
import { useEffect } from 'react';
import { useLogger } from '../hooks/useLogger';
import { SimulationOfflineBanner } from '@/components/client/SimulationOfflineBanner';

function makeQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 60 * 1000,
                // Important: keep deduplication working even with placeholderData
                retry: 2,
            },
        },
    });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
    if (typeof window === 'undefined') {
        return makeQueryClient();
    }
    if (!browserQueryClient) {
        browserQueryClient = makeQueryClient();
    }
    return browserQueryClient;
}

function AttachLoggerToQueryClient({ queryClient }: { queryClient: QueryClient }) {
    const logger = useLogger('GlobalQueryErrors');

    useEffect(() => {
        const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
            if (event?.type === 'updated' && event.query.state.status === 'error') {
                logger.error(`Query with key ${JSON.stringify(event.query.queryKey)} failed`, event.query.state.error, {
                    show: true,
                });
            }
        });
        return unsubscribe;
    }, [queryClient, logger]);

    return null;
}

export default function AppProviders({ children, session }: { children: React.ReactNode; session: Session | null }) {
    const queryClient = getQueryClient();

    return (
        <QueryClientProvider client={queryClient}>
            <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
                <AttachLoggerToQueryClient queryClient={queryClient} />
                <SimulationOfflineBanner />
                <SessionProvider session={session} refetchOnWindowFocus={true} refetchInterval={5 * 60}>
                    <SimulationTickPoller />
                    <PendingActionProvider>
                        <TourProvider>{children}</TourProvider>
                    </PendingActionProvider>
                </SessionProvider>
            </TRPCProvider>
        </QueryClientProvider>
    );
}
