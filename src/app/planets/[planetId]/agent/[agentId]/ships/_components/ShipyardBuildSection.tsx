'use client';

import { FacilityOrShipIcon, defaultHeight } from '@/components/client/FacilityOrShipIcon';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAddPendingAction, usePendingActions } from '@/hooks/useActionOverlay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { useErrorMessage } from '@/i18n/errors';
import { useMutation } from '@tanstack/react-query';
import { HardHat } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React, { useState } from 'react';
import { toast } from 'sonner';
import { ActionPendingOverlay } from '../../_component/ActionPendingOverlay';
import { BuildPlaceholderCard } from '../../_component/BuildPlaceholderCard';
import { CardHeaderBlock } from '../../_component/CardHeaderBlock';
import { FacilityCardShell } from '../../production/_component/FacilityCardShell';
import { FacilityConstructionPanel } from '../../production/_component/FacilityConstructionPanel';
import { selectPendingShipyardBuilds } from './shipyardHelpers';

function PendingShipyardCard({ name }: { name: string }): React.ReactElement {
    const tc = useTranslations('Common');
    const tt = useTranslations('Toasts');
    return (
        <FacilityCardShell
            className='max-w-[600px]'
            contentClassName='flex flex-col flex-1 gap-2'
            icon={<FacilityOrShipIcon facilityOrShipName='Shipyard' buildProgress={0} />}
            headerContent={
                <CardHeaderBlock
                    title={name}
                    titleClassName='text-amber-600 dark:text-amber-400'
                    badge={
                        <Badge
                            variant='secondary'
                            className='text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 text-[10px] px-1.5 py-0 gap-1'
                        >
                            <HardHat className='h-3.5 w-3.5' />
                            {tc('underConstruction')}
                        </Badge>
                    }
                    details={null}
                />
            }
        >
            <div className='relative mt-auto space-y-2'>
                <Separator />
                <ActionPendingOverlay message={tt('awaitingNextDay')} />
            </div>
        </FacilityCardShell>
    );
}

function ShipyardBuildForm({
    agentId,
    planetId,
    constructionServicePrice,
    onCancel,
}: {
    agentId: string;
    planetId: string;
    constructionServicePrice: number;
    onCancel: () => void;
}): React.ReactElement {
    const trpc = useTRPC();
    const addPending = useAddPendingAction();
    const t = useTranslations('Toasts');
    const ts = useTranslations('Ships');
    const tc = useTranslations('Common');
    const showError = useErrorMessage();
    const [shipyardName, setShipyardName] = useState('');

    const { data: financials } = useSimulationQuery(
        trpc.simulation.getAgentFinancials.queryOptions({ agentId, planetId }),
    );

    const buildMutation = useMutation(
        trpc.buildShipConstructionFacility.mutationOptions({
            onSuccess: (data) => {
                addPending({
                    type: 'shipBuild',
                    agentId,
                    planetId,
                    facilityId: data.facilityId,
                    facilityName: shipyardName.trim(),
                    triggerTick: data.processedAtTick,
                });
                toast.success(t('shipyardOrdered'));
                onCancel();
            },
            onError: (err) => {
                toast.error(err instanceof Error ? showError(err) : t('shipyardBuildFailed'));
            },
        }),
    );

    return (
        <FacilityCardShell
            className='max-w-[600px]'
            contentClassName='flex flex-col flex-1 gap-2'
            icon={<FacilityOrShipIcon facilityOrShipName='Shipyard' />}
            headerContent={
                <span className='flex flex-col gap-2' style={{ minHeight: `${defaultHeight}px` }}>
                    <div className='flex flex-col gap-1 mb-auto'>
                        <h3 className='font-semibold leading-tight'>{ts('build.newShipyard')}</h3>
                        <div className='flex flex-col gap-1'>
                            <Label className='text-xs text-muted-foreground'>{ts('build.shipyardName')}</Label>
                            <Input
                                className='h-8 text-xs'
                                placeholder={ts('build.shipyardNamePlaceholder')}
                                value={shipyardName}
                                maxLength={50}
                                onChange={(e) => setShipyardName(e.target.value)}
                            />
                        </div>
                    </div>
                </span>
            }
        >
            <div className='relative mt-auto space-y-2'>
                <Separator />
                <FacilityConstructionPanel
                    facilityType='ship_construction'
                    fromScale={0}
                    constructionServicePrice={constructionServicePrice}
                    planetId={planetId}
                    label={tc('buildAtScale')}
                    confirmLabel={tc('build')}
                    pendingLabel={ts('build.sendingBuild')}
                    isPending={buildMutation.isPending}
                    financials={financials}
                    onCancel={onCancel}
                    onConfirm={(targetScale) => {
                        if (!shipyardName.trim()) {
                            toast.error(t('shipyardNameRequired'));
                            return;
                        }
                        buildMutation.mutate({
                            agentId,
                            planetId,
                            facilityName: shipyardName.trim(),
                            targetScale,
                        });
                    }}
                />
                {buildMutation.isPending && <ActionPendingOverlay message={ts('build.sendingBuild')} />}
            </div>
        </FacilityCardShell>
    );
}

export function ShipyardBuildSection({
    agentId,
    planetId,
    constructionServicePrice,
}: {
    agentId: string;
    planetId: string;
    constructionServicePrice: number;
}): React.ReactElement {
    const pendingActions = usePendingActions(agentId, planetId);
    const ts = useTranslations('Ships');
    const pendingBuilds = selectPendingShipyardBuilds(pendingActions);
    const [configuring, setConfiguring] = useState(false);

    const pendingCards = pendingBuilds.map((build, index) => (
        <PendingShipyardCard key={build.facilityId ?? `${build.name}-${index}`} name={build.name} />
    ));

    if (configuring) {
        return (
            <>
                {pendingCards}
                <ShipyardBuildForm
                    agentId={agentId}
                    planetId={planetId}
                    constructionServicePrice={constructionServicePrice}
                    onCancel={() => setConfiguring(false)}
                />
            </>
        );
    }

    return (
        <>
            {pendingCards}
            <BuildPlaceholderCard label={ts('build.buildShipyard')} onClick={() => setConfiguring(true)} />
        </>
    );
}
