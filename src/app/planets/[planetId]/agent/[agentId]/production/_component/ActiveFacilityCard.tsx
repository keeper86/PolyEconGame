'use client';

import { defaultHeight, FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { Stat } from '@/components/client/Stat';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
import { useAddPendingAction, usePendingActions, useRemovePendingById } from '@/hooks/useActionOverlay';
import { useSimulationQuery, useSimulationTick } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { RECYCLER_BASE_RECOVERY_EFFICIENCY, RECYCLER_PAYMENT_RATIO } from '@/simulation/constants';
import type { ProductionFacility } from '@/simulation/planet/facility';
import { calculateCostsForConstruction, getFacilityType } from '@/simulation/planet/facility';
import { useMutation } from '@tanstack/react-query';
import { Clock, Percent, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { FacilityCardShell } from './FacilityCardShell';
import { FacilityConstructionPanel } from './FacilityConstructionPanel';
import { FacilityProductionIORow } from './FacilityProductionIORow';
import { ConstructionCompactRow } from './ConstructionCompactRow';
import { WorkerBars } from './WorkerBars';
import Link from 'next/link';

export function ActiveFacilityCard({
    facility,
    agentId,
    planetId,
    constructionServicePrice,
    onExpanded,
}: {
    facility: ProductionFacility;
    agentId: string;
    planetId: string;
    constructionServicePrice: number;
    onExpanded: () => void;
}): React.ReactElement {
    const trpc = useTRPC();
    const [previewScale, setPreviewScale] = useState(facility.maxScale + 1);
    const [showExpand, setShowExpand] = useState(false);
    const [showReduce, setShowReduce] = useState(false);

    const { data: financials } = useSimulationQuery(
        trpc.simulation.getAgentFinancials.queryOptions({ agentId, planetId }),
    );

    const SCALE_FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;
    const computeScaleFractionIndex = (scale: number, maxScale: number) => {
        const fraction = maxScale > 0 ? Math.round((scale / maxScale) * 4) / 4 : 1;
        const idx = SCALE_FRACTIONS.indexOf(fraction as (typeof SCALE_FRACTIONS)[number]);
        return idx >= 0 ? idx : 4;
    };

    const addPending = useAddPendingAction();
    const removePendingById = useRemovePendingById();
    const currentTick = useSimulationTick();
    const pendingActions = usePendingActions(agentId, planetId);

    // Check if there's a pending scale change for this facility
    const pendingScaleAction = pendingActions.find((a) => a.type === 'scaleChange' && a.facilityId === facility.id);

    const [scaleFractionIndex, setScaleFractionIndex] = useState(() => {
        // If there's a pending scale action, initialize slider to its target
        if (pendingScaleAction) {
            const idx = SCALE_FRACTIONS.indexOf(
                pendingScaleAction.targetScaleFraction as (typeof SCALE_FRACTIONS)[number],
            );
            return idx >= 0 ? idx : computeScaleFractionIndex(facility.scale, facility.maxScale);
        }
        return computeScaleFractionIndex(facility.scale, facility.maxScale);
    });
    useEffect(() => {
        // Don't reset slider position when snapshot updates if there's a pending action;
        // the user may be overwriting it.
        if (!pendingScaleAction) {
            setScaleFractionIndex(computeScaleFractionIndex(facility.scale, facility.maxScale));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [facility.scale, facility.maxScale, pendingScaleAction]);

    const expandMutation = useMutation(
        trpc.expandFacility.mutationOptions({
            onSuccess: () => {
                setShowExpand(false);
                onExpanded();
            },
            onError: () => {
                removePendingById(agentId, planetId, facility.id, 'expand');
            },
        }),
    );

    const setScaleMutation = useMutation(
        trpc.setFacilityScale.mutationOptions({
            onSuccess: () => {
                // pending action gets resolved by predicate check in useAgentPlanetDetail
            },
            onError: () => {
                removePendingById(agentId, planetId, facility.id, 'scaleChange');
            },
        }),
    );

    const contractMutation = useMutation(
        trpc.contractFacility.mutationOptions({
            onSuccess: () => {
                setShowReduce(false);
                onExpanded();
            },
            onError: () => {
                removePendingById(agentId, planetId, facility.id, 'contract');
            },
        }),
    );

    // Check pending expand/contract/cancel actions for this facility
    // These are placed after mutations to avoid temporal dead zone
    const pendingExpandAction = pendingActions.find((a) => a.type === 'expand' && a.facilityId === facility.id);
    const pendingContractAction = pendingActions.find((a) => a.type === 'contract' && a.facilityId === facility.id);
    const pendingCancelAction = pendingActions.find((a) => a.type === 'cancel' && a.facilityId === facility.id);

    // If expand is pending (mutation done, awaiting tick), keep the panel visible
    const expandPending = Boolean(pendingExpandAction) && !expandMutation.isPending;
    // If contract is pending, keep the reduce panel visible
    const contractPending = Boolean(pendingContractAction) && !contractMutation.isPending;

    const facilityType = useMemo(() => getFacilityType(facility), [facility]);

    const results = facility.lastTickResults;
    const eff = results?.overallEfficiency ?? 0;

    const globalMin = results
        ? Math.min(
              ...Object.values(results.resourceEfficiency),
              ...Object.values(results.workerEfficiency).filter((v): v is number => v !== undefined),
          )
        : 0;

    const committedFractionIndex = computeScaleFractionIndex(facility.scale, facility.maxScale);
    const scaleHasChanged = scaleFractionIndex !== committedFractionIndex;

    // ── Reduce panel state ──
    const reduceMax = facility.maxScale;
    const reduceOptions = useMemo(() => {
        const opts: number[] = [];
        if (reduceMax > 2) {
            const step = Math.max(1, Math.round(reduceMax / 6));
            for (let s = 1; s < reduceMax; s += step) {
                opts.push(s);
            }
            if (opts[opts.length - 1] !== reduceMax - 1) {
                opts.push(reduceMax - 1);
            }
        } else if (reduceMax > 1) {
            opts.push(1);
        }
        return opts;
    }, [reduceMax]);
    const [reduceTarget, setReduceTarget] = useState(reduceOptions[reduceOptions.length - 1] ?? 1);
    const reduceIndex = reduceOptions.indexOf(reduceTarget);
    const currentReduceIndex = reduceIndex !== -1 ? reduceIndex : reduceOptions.length - 1;

    // ── Recycler scrap recovery rate ──
    const { data: scrapRecoveryData } = useSimulationQuery(
        trpc.simulation.getPlanetScrapRecoveryRate.queryOptions({ planetId }),
    );
    const recyclerRatio = scrapRecoveryData?.recyclerRatio ?? 1;
    const csPrice = scrapRecoveryData?.csPrice ?? constructionServicePrice;

    // ── Estimated scrap payout ──
    const estimatedPayout = useMemo(() => {
        const { cost: recoveredCost } = calculateCostsForConstruction(facilityType, reduceTarget, facility.maxScale);
        const recoveredCS = recoveredCost * RECYCLER_BASE_RECOVERY_EFFICIENCY;
        const marketValue = recoveredCS * csPrice;
        return marketValue * RECYCLER_PAYMENT_RATIO * recyclerRatio;
    }, [facilityType, reduceTarget, facility.maxScale, csPrice, recyclerRatio]);

    // Compute the pending scale fraction from the pending action (if any)
    const pendingScaleFraction = pendingScaleAction?.targetScaleFraction;
    const pendingScaleText =
        pendingScaleFraction !== undefined ? `Pending → ${Math.round(pendingScaleFraction * 100)}%` : null;

    const operatingScaleSection = (
        <div className='space-y-1 pt-2 pb-1.5'>
            <span className='flex flex-row text-muted-foreground text-xs gap-2'>
                Operating scale
                <span>
                    {formatNumberWithUnit(facility.maxScale * (SCALE_FRACTIONS[scaleFractionIndex] ?? 1), 'units')}/
                    {formatNumberWithUnit(facility.maxScale, 'units')}
                </span>
                {pendingScaleText && (
                    <span className='text-amber-600 dark:text-amber-400 ml-auto text-[10px] italic'>
                        {pendingScaleText}
                    </span>
                )}
            </span>
            <div className='flex items-center gap-3'>
                <div className='flex-1 min-w-0 py-2'>
                    <Slider
                        min={0}
                        max={SCALE_FRACTIONS.length - 1}
                        step={1}
                        value={[scaleFractionIndex]}
                        onValueChange={([v]) => setScaleFractionIndex(v ?? 0)}
                        disabled={setScaleMutation.isPending}
                        className='w-full'
                    />
                    <div className='relative h-3 text-[10px] text-muted-foreground py-2'>
                        {SCALE_FRACTIONS.map((f, i) => {
                            const pct = (i / (SCALE_FRACTIONS.length - 1)) * 100;
                            const translate = i === 0 ? '0%' : i === SCALE_FRACTIONS.length - 1 ? '-100%' : '-50%';
                            return (
                                <span
                                    key={f}
                                    className='absolute'
                                    style={{ left: `${pct}%`, transform: `translateX(${translate})` }}
                                >
                                    {f * 100}%
                                </span>
                            );
                        })}
                    </div>
                </div>
                <Button
                    size='sm'
                    className='shrink-0 text-xs h-7 w-16'
                    disabled={setScaleMutation.isPending || !scaleHasChanged}
                    onClick={() => {
                        addPending({
                            type: 'scaleChange',
                            agentId,
                            planetId,
                            facilityId: facility.id,
                            targetScaleFraction: SCALE_FRACTIONS[scaleFractionIndex] ?? 1,
                            triggerTick: currentTick,
                        });
                        setScaleMutation.mutate({
                            agentId,
                            planetId,
                            facilityId: facility.id,
                            scaleFraction: SCALE_FRACTIONS[scaleFractionIndex] ?? 1,
                        });
                    }}
                >
                    {setScaleMutation.isPending ? <Spinner className='h-4 w-4' /> : 'Apply'}
                </Button>
            </div>
        </div>
    );

    const recyclerColor =
        recyclerRatio < 0.5 ? 'text-red-600' : recyclerRatio < 0.66 ? 'text-amber-600' : 'text-green-600';

    // Determine blocking overlay message for any in-flight or pending action
    const overlayMessage = expandMutation.isPending
        ? 'Expanding…'
        : expandPending
          ? 'Awaiting tick…'
          : contractMutation.isPending
            ? 'Reducing…'
            : contractPending
              ? 'Awaiting tick…'
              : pendingCancelAction
                ? 'Cancellation pending…'
                : null;

    return (
        <FacilityCardShell
            contentClassName='flex flex-col flex-1 gap-2'
            icon={<FacilityOrShipIcon facilityOrShipName={facility.name} />}
            headerContent={
                <span className='flex flex-col space-between gap-2' style={{ minHeight: `${defaultHeight}px` }}>
                    <div className='flex items-center gap-1 flex-col mb-1'>
                        <h3 className='font-semibold leading-tight '>{facility.name}</h3>
                        <span className='flex flex-col items-center gap-1'>
                            <Badge variant='outline' className='text-[10px] px-1.5 py-0'>
                                Scale {facility.scale} {facility.scale === facility.maxScale ? 'max' : ''}
                            </Badge>
                        </span>
                    </div>
                    <span className='flex flex-col text-muted-foreground text-xs gap-2'>
                        Worker efficiency
                        <WorkerBars
                            workerRequirement={facility.workerRequirement}
                            scale={facility.scale}
                            workerEfficiency={results?.workerEfficiency ?? {}}
                            globalMin={globalMin}
                            planetId={planetId}
                            agentId={agentId}
                        />
                    </span>
                </span>
            }
        >
            <div className='flex-1 space-y-2 pb-3'>
                <FacilityProductionIORow
                    needs={facility.needs}
                    produces={facility.produces}
                    scale={!showExpand ? facility.scale : previewScale}
                    resourceEfficiency={results?.resourceEfficiency ?? {}}
                    overallEfficiency={eff}
                    limitingEfficiency={globalMin}
                />
            </div>

            <div className='mt-auto space-y-2'>
                <Link href={`/planets/${planetId}/agent/${agentId}/financial` as never}>
                    <Separator />

                    <div className='py-1 flex flex-row items-center justify-center gap-3 text-[14px] text-muted-foreground bg-muted/80 w-full hover:ring-2 hover:ring-primary/50'>
                        {'revenue' in facility.lastTickResults && (
                            <>
                                <div className='flex flex-col items-center'>
                                    {' '}
                                    revenue{' '}
                                    <span className='tabular-nums text-green-600 dark:text-green-400'>
                                        {formatNumberWithUnit(facility.lastTickResults.revenue, 'currency', planetId)}
                                    </span>
                                </div>
                                <span className='shrink-0'>−</span>
                            </>
                        )}

                        <div className='flex flex-col items-center'>
                            {' '}
                            inputs{' '}
                            <span className='tabular-nums text-red-600 dark:text-red-400'>
                                {formatNumberWithUnit(facility.lastTickResults.inputCosts, 'currency', planetId)}
                            </span>
                        </div>

                        <span className='shrink-0'>−</span>

                        <div className='flex flex-col items-center'>
                            {' '}
                            wages{' '}
                            <span className='tabular-nums text-red-600 dark:text-red-400'>
                                {formatNumberWithUnit(facility.lastTickResults.wageCosts, 'currency', planetId)}
                            </span>
                        </div>

                        <span className='shrink-0'>=</span>

                        <div className='flex flex-col items-center text-foreground'>
                            {' '}
                            net/day{' '}
                            <span
                                className={`tabular-nums text-md ${
                                    results.costBalance >= 0
                                        ? 'text-green-600 dark:text-green-400'
                                        : 'text-red-600 dark:text-red-400'
                                }`}
                            >
                                {formatNumberWithUnit(facility.lastTickResults.costBalance, 'currency', planetId)}
                            </span>
                        </div>
                    </div>

                    <Separator />
                </Link>

                <div className='relative'>
                    <div className='space-y-2'>
                        {facility.construction ? null : showExpand || expandPending ? (
                            <FacilityConstructionPanel
                                facilityType={facilityType}
                                fromScale={facility.maxScale}
                                constructionServicePrice={constructionServicePrice}
                                planetId={planetId}
                                label='Expand to scale'
                                confirmLabel='Confirm Expand'
                                pendingLabel={expandMutation.isPending ? 'Expanding…' : 'Awaiting tick…'}
                                isPending={expandMutation.isPending || expandPending}
                                financials={financials}
                                onCancel={() => setShowExpand(false)}
                                onConfirm={(targetScale) => {
                                    addPending({
                                        type: 'expand',
                                        agentId,
                                        planetId,
                                        facilityId: facility.id,
                                        targetScale,
                                        triggerTick: currentTick,
                                    });
                                    expandMutation.mutate({ agentId, planetId, facilityId: facility.id, targetScale });
                                }}
                                onScaleChange={setPreviewScale}
                            />
                        ) : showReduce || contractPending ? (
                            <div className='space-y-2'>
                                <p className='text-xs text-muted-foreground pt-2 pb-1'>Reduce capacity to scale</p>
                                <Slider
                                    min={0}
                                    max={Math.max(0, reduceOptions.length - 1)}
                                    step={1}
                                    value={[currentReduceIndex]}
                                    onValueChange={([v]) => {
                                        const target = reduceOptions[v ?? 0];
                                        if (target !== undefined) {
                                            setReduceTarget(target);
                                        }
                                    }}
                                    disabled={contractMutation.isPending}
                                    className='w-full'
                                />
                                <div className='relative h-4 text-[10px] text-muted-foreground'>
                                    {reduceOptions.map((v, i) => {
                                        const pct = (i / Math.max(1, reduceOptions.length - 1)) * 100;
                                        const translate =
                                            i === 0 ? '0%' : i === reduceOptions.length - 1 ? '-100%' : '-50%';
                                        return (
                                            <span
                                                key={v}
                                                className='absolute'
                                                style={{
                                                    left: `${pct}%`,
                                                    transform: `translateX(${translate})`,
                                                }}
                                            >
                                                {formatNumberWithUnit(v, 'none')}
                                            </span>
                                        );
                                    })}
                                </div>

                                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 pb-1'>
                                    <div className='grid grid-cols-1 gap-y-1'>
                                        <Stat
                                            label='Reduced capacity'
                                            value={formatNumberWithUnit(facility.maxScale - reduceTarget, 'units')}
                                            icon={<TrendingDown className='h-3 w-3' />}
                                        />
                                        <Stat
                                            label='Estimated price'
                                            value={formatNumberWithUnit(estimatedPayout, 'currency', planetId)}
                                            icon={<TrendingUp className='h-3 w-3' />}
                                        />
                                        <Stat
                                            label='Efficiency'
                                            value={
                                                Math.round(recyclerRatio * RECYCLER_BASE_RECOVERY_EFFICIENCY * 100) +
                                                '%'
                                            }
                                            icon={<Clock className='h-3 w-3' />}
                                            valueClassName={recyclerColor}
                                        />
                                    </div>
                                    <div className='grid grid-cols-1 gap-y-1'>
                                        <Stat
                                            label='Deposits'
                                            value={formatNumberWithUnit(financials?.deposits, 'currency', planetId)}
                                            icon={<Wallet className='h-3 w-3' />}
                                        />
                                        <Stat
                                            label='Monthly cash flow'
                                            value={formatNumberWithUnit(
                                                financials?.monthlyNetCashFlow,
                                                'currency',
                                                planetId,
                                            )}
                                            icon={<Percent className='h-3 w-3' />}
                                        />
                                        <Stat
                                            label='Loans'
                                            value={formatNumberWithUnit(0, 'currency', planetId)}
                                            icon={<TrendingDown className='h-3 w-3' />}
                                        />
                                    </div>
                                </div>
                                <div className='flex gap-2'>
                                    <Button
                                        size='sm'
                                        variant='outline'
                                        className='flex-1 text-xs'
                                        onClick={() => setShowReduce(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        size='sm'
                                        className='flex-1 text-xs'
                                        disabled={contractMutation.isPending}
                                        onClick={() => {
                                            addPending({
                                                type: 'contract',
                                                agentId,
                                                planetId,
                                                facilityId: facility.id,
                                                targetScale: reduceTarget,
                                                triggerTick: currentTick,
                                            });
                                            contractMutation.mutate({
                                                agentId,
                                                planetId,
                                                facilityId: facility.id,
                                                targetScale: reduceTarget,
                                            });
                                        }}
                                    >
                                        <span
                                            className={`font-bold text-[14px] dark:text-[12px] ${recyclerColor} text-outline-strong text-muted-foreground`}
                                        >
                                            {contractMutation.isPending ? 'Reducing…' : 'Confirm Reduce'}
                                        </span>
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {operatingScaleSection}
                                <Separator />
                                <div className='flex gap-2 pt-1'>
                                    <Button
                                        variant='outline'
                                        size='sm'
                                        className='flex-1 text-xs gap-1'
                                        disabled={facility.construction !== null}
                                        onClick={() => {
                                            setPreviewScale(facility.maxScale + 1);
                                            setShowReduce(false);
                                            setShowExpand(true);
                                        }}
                                    >
                                        Expand facility
                                    </Button>
                                    <Button
                                        variant='outline'
                                        size='sm'
                                        className='flex-1 text-xs gap-1'
                                        disabled={facility.maxScale <= 1}
                                        onClick={() => {
                                            setShowExpand(false);
                                            setShowReduce(true);
                                        }}
                                    >
                                        Reduce capacity
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Blocking overlay only over the action controls (not the revenue row) */}
                    {overlayMessage && (
                        <div className='absolute inset-0 z-10 flex items-center justify-center bg-background/95 dark:bg-card shadow-inner rounded-lg'>
                            <span className='flex items-center gap-2 text-sm font-medium text-foreground'>
                                <Spinner className='h-4 w-4' />
                                {overlayMessage}
                            </span>
                        </div>
                    )}
                </div>
            </div>
            {facility.construction !== null && <ConstructionCompactRow facility={facility} />}
        </FacilityCardShell>
    );
}
