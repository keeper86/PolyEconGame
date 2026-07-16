'use client';

import { Page } from '@/components/client/Page';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAgentId } from '@/hooks/useAgentId';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { useParams } from 'next/navigation';
import BankPanel from './_components/BankPanel';
import { LicensePanel } from '@/app/planets/[planetId]/agent/_component/LicensePanel';

export default function CentralBankPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const trpc = useTRPC();
    const { agentId, isLoading: agentIdLoading } = useAgentId();

    const { data: planetData, isLoading: planetLoading } = useSimulationQuery(
        trpc.simulation.getPlanetEconomy.queryOptions({ planetId }),
    );

    const agentDetailEnabled = !!agentId && !planetLoading && !!planetData?.economy;
    const agentDetailOptions = trpc.simulation.getAgentPlanetDetail.queryOptions({ agentId: agentId ?? '', planetId });
    const { data: agentDetailData } = useSimulationQuery({
        ...agentDetailOptions,
        enabled: agentDetailEnabled,
    });

    const economy = planetData?.economy ?? null;

    if (planetLoading || agentIdLoading) {
        return (
            <Page title='Central Bank'>
                <div className='text-sm text-muted-foreground'>Loading economy data…</div>
            </Page>
        );
    }

    if (!economy || !agentId) {
        return (
            <Page title='Central Bank'>
                <div className='text-sm text-muted-foreground'>Planet or agent not found.</div>
            </Page>
        );
    }

    const licenses = agentDetailData?.detail?.assets?.licenses;

    return (
        <Page title='Central Bank'>
            <Card>
                <CardContent className='px-3 py-3 space-y-3'>
                    <BankPanel bank={economy.bank} planetId={planetId} />
                    <Separator />
                    <LicensePanel agentId={agentId} planetId={planetId} isOwnAgent={true} licenses={licenses} />
                </CardContent>
            </Card>
        </Page>
    );
}
