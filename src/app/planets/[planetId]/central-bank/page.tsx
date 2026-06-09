'use client';

import { Page } from '@/components/client/Page';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAgentId } from '@/hooks/useAgentId';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { useParams } from 'next/navigation';
import BankPanel from './_components/BankPanel';
import LoanPanel from './_components/LoanPanel';

export default function CentralBankPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const trpc = useTRPC();
    const myAgentId = useAgentId();

    const { data, isLoading } = useSimulationQuery(
        trpc.simulation.getPlanetEconomy.queryOptions({ planetId }),
    );

    const { data: agentDetail } = useSimulationQuery(
        trpc.simulation.getAgentPlanetDetail.queryOptions(
            { agentId: myAgentId.agentId ?? '', planetId },
            { enabled: !!myAgentId.agentId },
        ),
    );

    const economy = data?.economy ?? null;
    const hasAgent = !!myAgentId.agentId && !!agentDetail?.detail;

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

                    {hasAgent && (
                        <>
                            <Separator />
                            <LoanPanel
                                agentId={myAgentId.agentId ?? ''}
                                planetId={planetId}
                                deposits={agentDetail.detail?.assets?.deposits ?? 0}
                            />
                        </>
                    )}
                </CardContent>
            </Card>
        </Page>
    );
}