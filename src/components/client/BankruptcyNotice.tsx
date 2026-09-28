'use client';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Landmark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { Page } from './Page';

function tickToYear(tick: number): number {
    return Math.floor((tick - 1) / (30 * 12)) + 2200;
}

export function BankruptcyNotice() {
    const trpc = useTRPC();
    const router = useRouter();
    const t = useTranslations('Bankruptcy');
    const { update: updateSession } = useSession();
    const queryClient = useQueryClient();

    const { data, isLoading } = useSimulationQuery(trpc.simulation.getMyBankruptcy.queryOptions());

    useEffect(() => {
        if (!isLoading && !data?.bankruptcy) {
            router.replace('/');
        }
    }, [isLoading, data, router]);

    const acknowledgeMutation = useMutation(
        trpc.acknowledgeBankruptcy.mutationOptions({
            onSuccess: async () => {
                await updateSession({ agentId: null, planetId: null });
                void queryClient.invalidateQueries(trpc.getUser.queryFilter());
                toast.success('Your company has been dissolved. Good luck with your next venture!');
                router.replace('/');
            },
            onError: (err: unknown) => {
                const message = err instanceof Error ? err.message : 'An unexpected error occurred';
                toast.error(message);
            },
        }),
    );

    if (isLoading || !data?.bankruptcy) {
        return (
            <Page title='You are bankrupt'>
                <Spinner />
            </Page>
        );
    }

    const record = data.bankruptcy;
    const restructured = record.outcome === 'restructured';

    return (
        <Page title='You are bankrupt'>
            <div className='grid gap-4 max-w-xl'>
                <div className='flex items-center gap-3'>
                    {restructured ? (
                        <Building2 className='h-8 w-8 text-muted-foreground' />
                    ) : (
                        <Landmark className='h-8 w-8 text-muted-foreground' />
                    )}
                    <div>
                        <p className='font-semibold'>{record.agentName}</p>
                        <p className='text-sm text-muted-foreground'>
                            {record.planetName ?? record.planetId} · year {tickToYear(record.tick)}
                        </p>
                    </div>
                </div>

                <p className='text-muted-foreground text-sm'>
                    Your company was declared insolvent and handed over to the receiver. Outstanding debt was written
                    off and the remaining assets were{' '}
                    {restructured ? 'restructured under automated administration' : 'liquidated to cover the costs'}.
                </p>

                <div className='rounded-md border border-border p-3 text-sm text-muted-foreground'>
                    {record.outcome === 'restructured'
                        ? t('restructured', { agentName: record.agentName, successorName: record.successorAgentName })
                        : t('liquidated', { agentName: record.agentName })}
                </div>

                <div>
                    <Button onClick={() => acknowledgeMutation.mutate()} disabled={acknowledgeMutation.isPending}>
                        {acknowledgeMutation.isPending ? <Spinner className='mr-2 h-4 w-4' /> : null}
                        Found a new company
                    </Button>
                </div>
            </div>
        </Page>
    );
}
