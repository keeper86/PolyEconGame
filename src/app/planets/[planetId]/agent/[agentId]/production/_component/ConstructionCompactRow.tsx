'use client';

import { useGameConfig } from '@/components/client/GameConfigContext';
import { ProductQuantity } from '@/components/client/ProductQuantity';
import { mapTickToDate } from '@/components/client/TickDisplay';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { useAddPendingAction, usePendingActions, useRemovePendingById } from '@/hooks/useActionOverlay';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { useSimulationTick } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit, formatWallTime } from '@/lib/utils';
import type { Facility } from '@/simulation/planet/facility';
import { constructionServiceResourceType } from '@/simulation/planet/services';
import { useMutation } from '@tanstack/react-query';
import { Clock, Timer } from 'lucide-react';
import { useParams } from 'next/navigation';
import React from 'react';
import { RiArrowRightBoxFill } from 'react-icons/ri';

export function ConstructionCompactRow({ facility }: { facility: Facility }): React.ReactElement {
    const { planetId, agentId } = useParams() as { planetId: string; agentId: string };
    const smallScreen = useIsSmallScreen();
    const trpc = useTRPC();

    const currentTick = useSimulationTick();
    const { tickIntervalMs } = useGameConfig();
    const removePendingById = useRemovePendingById();
    const addPending = useAddPendingAction();
    const pendingActions = usePendingActions(agentId, planetId);

    // Check if there's a pending cancel action for this facility
    const hasPendingCancel = pendingActions.some(
        (a) => a.type === 'cancel' && a.facilityId === facility.id,
    );

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

    const cs = facility.construction;

    if (!cs) {
        return <div>Error: Facility is not under construction</div>;
    }

    // If cancel was submitted and we're awaiting the tick, show pending state
    if (hasPendingCancel) {
        return (
            <div className='mt-auto space-y-2 py-2'>
                <div className='flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground'>
                    <Spinner className='h-4 w-4' />
                    <span>Cancellation pending…</span>
                </div>
            </div>
        );
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
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            variant='outline'
                            size='sm'
                            className='w-full text-xs gap-1'
                            disabled={cancelMutation.isPending}
                        >
                            {cancelMutation.isPending ? 'Cancelling…' : 'Cancel Construction'}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Cancel construction?</AlertDialogTitle>
                            <AlertDialogDescription>
                                All construction progress will be permanently lost. There is no refund for construction
                                services already invested.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Keep building</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => {
                    addPending({
                        type: 'cancel',
                        agentId,
                        planetId,
                        facilityId: facility.id,
                        triggerTick: currentTick,
                    });
                    cancelMutation.mutate({ agentId, planetId, facilityId: facility.id });
                }}
                            >
                                Cancel construction
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </>
    );
}