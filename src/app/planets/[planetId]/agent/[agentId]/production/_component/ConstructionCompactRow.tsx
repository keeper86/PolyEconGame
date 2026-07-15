'use client';

import { useGameConfig } from '@/components/client/GameConfigContext';
import { ProductQuantity } from '@/components/client/ProductQuantity';
import { mapTickToDate } from '@/components/client/TickDisplay';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { useAddPendingAction, useRemovePendingById } from '@/hooks/useActionOverlay';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { useSimulationTick } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit, formatWallTime } from '@/lib/utils';
import type { Facility } from '@/simulation/planet/facility';
import { constructionServiceResourceType } from '@/simulation/planet/services';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Clock, Timer } from 'lucide-react';
import { useParams } from 'next/navigation';
import React, { useState } from 'react';
import { RiArrowRightBoxFill } from 'react-icons/ri';

export function ConstructionCompactRow({
    facility,
    isPendingCancel,
}: {
    facility: Facility;
    isPendingCancel?: boolean;
}): React.ReactElement {
    const { planetId, agentId } = useParams() as { planetId: string; agentId: string };
    const smallScreen = useIsSmallScreen();
    const trpc = useTRPC();

    const currentTick = useSimulationTick();
    const { tickIntervalMs } = useGameConfig();
    const removePendingById = useRemovePendingById();
    const addPending = useAddPendingAction();
    const cancelMutation = useMutation(
        trpc.cancelConstruction.mutationOptions({
            onSuccess: () => {
                // Pending action will be resolved by predicate check
            },
            onError: () => {
                removePendingById(agentId, planetId, facility.id);
            },
        }),
    );

    const [showCancelDialog, setShowCancelDialog] = useState(false);

    const cs = facility.construction;

    if (!cs) {
        return <div>Error: Facility is not under construction</div>;
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
    if (ticksRemaining > 0 && isFinite(ticksRemaining)) {
        const wallTimeMs = ticksRemaining * tickIntervalMs;
        const wallTime = formatWallTime(wallTimeMs, smallScreen);
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
        const finishMessage = smallScreen
            ? 'Construction finished.'
            : 'Construction finished. Wait for next tick to take effect.';
        estimateDisplay = (
            <div className='flex flex-row w-full justify-center text-xs text-emerald-600 dark:text-emerald-400'>
                <span className='flex items-center gap-1 '>
                    <Spinner className='h-3 w-3' />
                    {finishMessage}
                </span>
            </div>
        );
    } else {
        const stalledMessage = smallScreen ? 'No construction!' : 'Stalled — no construction services.';
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
                                Build {formatNumberWithUnit(facility.maxScale, 'none')} →{' '}
                                <span className='font-medium text-foreground'>
                                    {formatNumberWithUnit(cs.constructionTargetMaxScale, 'none')}
                                </span>
                            </p>
                        </Badge>

                        <span className='font-medium text-foreground'>{pct.toFixed(0)}%</span>
                    </div>
                    <Progress value={pct} className='h-2.5 bg-amber-100 dark:bg-amber-950/40 [&>div]:bg-amber-500' />
                    {estimateDisplay}
                </div>
            </div>

            <div className='mt-auto space-y-2'>
                <Button
                    size='sm'
                    variant='destructive'
                    className='w-full text-xs gap-1'
                    disabled={cancelMutation.isPending || isPendingCancel}
                    onClick={() => setShowCancelDialog(true)}
                >
                    {cancelMutation.isPending || isPendingCancel ? 'Cancelling…' : 'Cancel'}
                </Button>
            </div>

            <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className='flex items-center gap-2'>
                            <AlertTriangle className='h-5 w-5 text-amber-600 dark:text-amber-400' />
                            Cancel construction?
                        </DialogTitle>
                        <DialogDescription>
                            All construction progress will be permanently lost. There is no refund for construction
                            services already invested.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <div className='flex gap-2 pt-1 w-full'>
                            <Button
                                size='sm'
                                variant='destructive'
                                className='flex-1 text-xs gap-1'
                                onClick={() => setShowCancelDialog(false)}
                            >
                                Keep building
                            </Button>
                            <Button
                                size='sm'
                                variant='outline'
                                className='flex-1 text-xs gap-1'
                                onClick={() => {
                                    addPending({
                                        type: 'cancel',
                                        agentId,
                                        planetId,
                                        facilityId: facility.id,
                                        triggerTick: currentTick,
                                    });
                                    cancelMutation.mutate({ agentId, planetId, facilityId: facility.id });
                                    setShowCancelDialog(false);
                                }}
                            >
                                Cancel Construction
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
