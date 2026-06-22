'use client';

import { Page } from '@/components/client/Page';
import { Card, CardContent } from '@/components/ui/card';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { useParams } from 'next/navigation';
import BankPanel from './_components/BankPanel';

export default function CentralBankPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const trpc = useTRPC();

    const { data, isLoading } = useSimulationQuery(trpc.simulation.getPlanetEconomy.queryOptions({ planetId }));

    const economy = data?.economy ?? null;

    if (isLoading) {
        return (
            <Page title='Central Bank'>
                <div className='text-sm text-muted-foreground'>Loading economy data…</div>
            </Page>
        );
    }

    if (!economy) {
        return (
            <Page title='Central Bank'>
                <div className='text-sm text-muted-foreground'>Planet not found.</div>
            </Page>
        );
    }

    return (
        <Page title='Central Bank'>
            <Card>
                <CardContent className='px-3 py-3 space-y-3'>
                    <BankPanel bank={economy.bank} planetId={planetId} />
                </CardContent>
            </Card>
        </Page>
    );
}
