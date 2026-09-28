'use client';

import { useGameConfig } from '@/components/client/GameConfigContext';
import { ProductQuantity } from '@/components/client/ProductQuantity';
import { mapTickToDate } from '@/components/client/TickDisplay';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { useAddPendingAction } from '@/hooks/useActionOverlay';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { useSimulationTick } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit, formatWallTime } from '@/lib/utils';
import { useErrorMessage } from '@/i18n/errors';
import type { Facility } from '@/simulation/planet/facility';
import { constructionServiceResourceType } from '@/simulation/planet/services';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Clock, Pause, Play, Timer } from 'lucide-react';
import { useParams } from 'next/navigation';
import React, { useState } from 'react';
import { RiArrowRightBoxFill } from 'react-icons/ri';
import { toast } from 'sonner';
import { useLocale, useTranslations } from 'next-intl';

export function ConstructionCompactRow({
    facility,
    isPendingCancel,
    isPendingSuspension,
    hideCancel,
}: {
    facility: Facility;
    isPendingCancel?: boolean;
    isPendingSuspension?: boolean;
    hideCancel?: boolean;
}): React.ReactElement {
    const locale = useLocale();
    const { planetId, agentId } = useParams() as { planetId: string; agentId: string };
    const smallScreen = useIsSmallScreen();
    const trpc = useTRPC();

    const currentTick = useSimulationTick();
    const { tickIntervalMs } = useGameConfig();
    const t = useTranslations('Toasts');
    const tp = useTranslations('Production');
    const tc = useTranslations('Common');
    const showError = useErrorMessage();
    const addPending = useAddPendingAction();
    const cancelMutation = useMutation(
        trpc.cancelConstruction.mutationOptions({
            onSuccess: (data) => {
                addPending({
                    type: 'cancel',
                    agentId,
                    planetId,
                    facilityId: facility.id,
                    triggerTick: data.processedAtTick,
                });
                toast.success(t('constructionCancelled'));
            },
            onError: (err) => {
                toast.error(err instanceof Error ? showError(err) : t('cancelFailed'));
            },
        }),
    );

    const suspendMutation = useMutation(
        trpc.setConstructionSuspended.mutationOptions({
            onSuccess: (data, variables) => {
                addPending({
                    type: variables.suspended ? 'suspend' : 'resume',
                    agentId,
                    planetId,
                    facilityId: facility.id,
                    triggerTick: data.processedAtTick,
                });
                toast.success(variables.suspended ? t('constructionSuspended') : t('constructionResumed'));
            },
            onError: (err) => {
                toast.error(err instanceof Error ? showError(err) : t('suspensionChangeFailed'));
            },
        }),
    );

    const [showCancelDialog, setShowCancelDialog] = useState(false);

    const cs = facility.construction;

    if (!cs) {
        return <div>{tp('facilityNotUnderConstruction')}</div>;
    }

    const pct =
        cs.totalConstructionServiceRequired > 0
            ? Math.min(100, (cs.progress / cs.totalConstructionServiceRequired) * 100)
            : 0;

    const remainingServices = cs.totalConstructionServiceRequired - cs.progress;

    const ticksRemaining =
        cs.lastTickInvestedConstructionServices > 0
            ? remainingServices / cs.lastTickInvestedConstructionServices
            : Infinity;

    let estimateDisplay: React.ReactNode = null;
    if (cs.suspended) {
        const suspendedMessage = smallScreen ? tp('suspendedShort') : tp('suspendedLong');
        estimateDisplay = (
            <div className='flex flex-row w-full justify-center text-xs text-muted-foreground'>
                <span className='flex items-center gap-1'>
                    <Pause className='h-3 w-3' />
                    {suspendedMessage}
                </span>
            </div>
        );
    } else if (ticksRemaining > 0 && isFinite(ticksRemaining)) {
        const wallTimeMs = ticksRemaining * tickIntervalMs;
        const wallTime = formatWallTime(wallTimeMs, smallScreen, locale);
        const completionDate = mapTickToDate(currentTick + Math.ceil(ticksRemaining), smallScreen);
        estimateDisplay = (
            <div className='flex flex-row w-full justify-between text-xs text-muted-foreground'>
                <span className='flex items-center gap-1'>
                    <Timer className='h-3 w-3' />
                    {wallTime}
                </span>

                <span className='flex items-center gap-1'>
                    <Clock className='h-3 w-3' />
                    {completionDate}
                </span>
            </div>
        );
    } else if (ticksRemaining <= 0) {
        const finishMessage = smallScreen ? tp('constructionFinishedShort') : tp('constructionFinishedLong');
        estimateDisplay = (
            <div className='flex flex-row w-full justify-center text-xs text-emerald-600 dark:text-emerald-400'>
                <span className='flex items-center gap-1 '>
                    <Spinner className='h-3 w-3' />
                    {finishMessage}
                </span>
            </div>
        );
    } else {
        const stalledMessage = smallScreen ? tp('noConstructionShort') : tp('stalledLong');
        estimateDisplay = (
            <div className='flex flex-row w-full justify-center text-xs text-amber-600 dark:text-amber-400'>
                <span className='flex items-center gap-1'>
                    <Timer className='h-3 w-3' />
                    {stalledMessage}
                </span>
            </div>
        );
    }

    return (
        <>
            <div className='grid w-full items-center gap-x-2 py-2' style={{ gridTemplateColumns: '1fr auto 3fr' }}>
                <div className='flex flex-wrap gap-1.5 justify-center'>
                    <ProductQuantity
                        quantity={cs.lastTickInvestedConstructionServices}
                        resource={constructionServiceResourceType}
                        efficiency={cs.lastTickInvestedConstructionServices / cs.maximumConstructionServiceConsumption}
                        planetId={planetId}
                        agentId={agentId}
                        isLimiting={cs.lastTickInvestedConstructionServices < cs.maximumConstructionServiceConsumption}
                    />
                </div>

                <RiArrowRightBoxFill className={`shrink-0 h-8 w-8 text-muted-foreground`} />

                <div className='flex flex-wrap gap-1.5 sm:pl-4 justify-center'>
                    <div className='flex flex-row w-full justify-between text-xs text-muted-foreground mb-1'>
                        <Badge
                            variant='secondary'
                            className='text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 text-[10px] px-1.5 py-0 gap-1'
                        >
                            <p className='text-xs text-muted-foreground mt-0.5'>
                                {tp('buildFromTo', {
                                    from: formatNumberWithUnit(facility.maxScale, 'none', undefined, locale),
                                    to: formatNumberWithUnit(cs.constructionTargetMaxScale, 'none', undefined, locale),
                                })}
                            </p>
                        </Badge>

                        <span className='flex items-center gap-1.5'>
                            {cs.suspended && (
                                <Badge
                                    variant='secondary'
                                    className='text-muted-foreground border-muted-foreground/30 text-[10px] px-1.5 py-0 gap-1'
                                >
                                    <Pause className='h-3 w-3' />
                                    {tp('suspended')}
                                </Badge>
                            )}
                            <span className='font-medium text-foreground'>{pct.toFixed(0)}%</span>
                        </span>
                    </div>
                    <Progress
                        value={pct}
                        className={`h-2.5 bg-amber-100 dark:bg-amber-950/40 ${cs.suspended ? '[&>div]:bg-muted-foreground/50' : '[&>div]:bg-amber-500'}`}
                    />
                    {estimateDisplay}
                </div>
            </div>

            <div className='mt-auto space-y-2'>
                <div className='flex gap-2'>
                    <Button
                        size='sm'
                        variant={cs.suspended ? 'default' : 'outline'}
                        className='flex-1 text-xs gap-1'
                        disabled={suspendMutation.isPending || isPendingSuspension || isPendingCancel}
                        onClick={() =>
                            suspendMutation.mutate({
                                agentId,
                                planetId,
                                facilityId: facility.id,
                                suspended: !cs.suspended,
                            })
                        }
                    >
                        {cs.suspended ? <Play className='h-3.5 w-3.5' /> : <Pause className='h-3.5 w-3.5' />}
                        {suspendMutation.isPending || isPendingSuspension
                            ? cs.suspended
                                ? tp('resuming')
                                : tp('suspending')
                            : cs.suspended
                              ? tp('resume')
                              : tp('suspend')}
                    </Button>
                    {!hideCancel && (
                        <Button
                            size='sm'
                            variant='destructive'
                            className='flex-1 text-xs gap-1'
                            disabled={cancelMutation.isPending || isPendingCancel || isPendingSuspension}
                            onClick={() => setShowCancelDialog(true)}
                        >
                            {cancelMutation.isPending || isPendingCancel ? tp('cancelling') : tc('cancel')}
                        </Button>
                    )}
                </div>
            </div>

            <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className='flex items-center gap-2'>
                            <AlertTriangle className='h-5 w-5 text-amber-600 dark:text-amber-400' />
                            {tp('cancelConstructionTitle')}
                        </DialogTitle>
                        <DialogDescription>{tp('cancelConstructionBody')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <div className='flex gap-2 pt-1 w-full'>
                            <Button
                                size='sm'
                                variant='destructive'
                                className='flex-1 text-xs gap-1'
                                onClick={() => setShowCancelDialog(false)}
                            >
                                {tp('keepBuilding')}
                            </Button>
                            <Button
                                size='sm'
                                variant='outline'
                                className='flex-1 text-xs gap-1'
                                onClick={() => {
                                    cancelMutation.mutate({ agentId, planetId, facilityId: facility.id });
                                    setShowCancelDialog(false);
                                }}
                            >
                                {tp('cancelConstruction')}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
