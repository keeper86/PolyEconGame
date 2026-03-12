'use client';

/**
 * SimulationOfflineBanner
 *
 * Subscribes to the global QueryCache and shows a dismissable banner
 * whenever one or more queries have stopped polling due to repeated failures
 * (fetchFailureCount >= SIMULATION_MAX_RETRIES).
 *
 * The "Retry" button calls queryClient.resetQueries() on all failed queries,
 * which resets their failure counters and re-enables polling.
 */

import { useQueryClient } from '@tanstack/react-query';
import { WifiOff, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { SIMULATION_MAX_RETRIES } from '@/hooks/useSimulationQuery';
import { Button } from '@/components/ui/button';

export function SimulationOfflineBanner() {
    const queryClient = useQueryClient();
    const [failedCount, setFailedCount] = useState(0);

    const countFailed = useCallback(() => {
        const failed = queryClient
            .getQueryCache()
            .getAll()
            .filter((q) => q.state.fetchFailureCount >= SIMULATION_MAX_RETRIES).length;
        setFailedCount(failed);
    }, [queryClient]);

    useEffect(() => {
        // Run once on mount, then subscribe to cache updates.
        countFailed();
        const unsubscribe = queryClient.getQueryCache().subscribe(() => {
            countFailed();
        });
        return unsubscribe;
    }, [queryClient, countFailed]);

    const handleRetry = useCallback(() => {
        // Reset all queries that have exhausted their retries.
        // resetQueries clears error state + failure counters and re-fetches.
        const failedQueries = queryClient
            .getQueryCache()
            .getAll()
            .filter((q) => q.state.fetchFailureCount >= SIMULATION_MAX_RETRIES);

        for (const query of failedQueries) {
            void queryClient.resetQueries({ queryKey: query.queryKey });
        }
    }, [queryClient]);

    if (failedCount === 0) {
        return null;
    }

    return (
        <div className='fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive shadow-lg backdrop-blur'>
            <WifiOff className='h-4 w-4 shrink-0' />
            <span>
                Simulation data unavailable — {failedCount === 1 ? '1 query' : `${failedCount} queries`} stopped
                polling.
            </span>
            <Button
                variant='outline'
                size='sm'
                className='h-7 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10'
                onClick={handleRetry}
            >
                <RotateCcw className='h-3.5 w-3.5' />
                Retry
            </Button>
        </div>
    );
}
