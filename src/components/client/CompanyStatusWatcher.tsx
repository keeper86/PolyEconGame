'use client';

import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Watches the current user's bankruptcy record on every simulation tick.
 * When a record appears (the player's company went bankrupt while they were
 * logged in), redirects to /bankrupt. App Router layouts do not re-run on
 * client-side navigation, so this must run globally.
 */
export function CompanyStatusWatcher() {
    const trpc = useTRPC();
    const router = useRouter();
    const { status } = useSession();

    const { data, isLoading } = useSimulationQuery(trpc.simulation.getMyBankruptcy.queryOptions());

    useEffect(() => {
        if (status !== 'authenticated' || isLoading || !data?.bankruptcy) {
            return;
        }
        if (window.location.pathname.startsWith('/bankrupt')) {
            return;
        }
        router.replace('/bankrupt' as never);
    }, [data, isLoading, router, status]);

    return null;
}
