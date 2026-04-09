'use client';

import { mapTickToDate } from '@/components/client/TickDisplay';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import type { AgentClaimEntry, ClaimResourceSummary } from '@/server/controller/planet';
import { MONTHS_PER_YEAR, TICKS_PER_MONTH } from '@/simulation/constants';
import { SY_TIERS, calcClaimQuantity, calcClaimCost } from './claimCalculations';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, InfoIcon, Loader2, RefreshCw } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { ClaimCardHeader } from './ClaimCardHeader';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

function formatDepletion(ticks: number | null): string {
    if (ticks === null) {
        return 'Sustainable';
    }
    const months = Math.floor(ticks / TICKS_PER_MONTH);
    if (months < MONTHS_PER_YEAR) {
        return `~${months} month${months !== 1 ? 's' : ''}`;
    }
    const years = Math.floor(months / MONTHS_PER_YEAR);
    const remMonths = months % MONTHS_PER_YEAR;
    return remMonths > 0 ? `~${years}y ${remMonths}m` : `~${years} year${years !== 1 ? 's' : ''}`;
}

export function ActiveClaimCard({
    claim,
    summary,
    agentId,
    planetId,
}: {
    claim: AgentClaimEntry;
    summary: ClaimResourceSummary;
    agentId: string;
    planetId: string;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [showExpand, setShowExpand] = useState(false);
    const [expandTierIndex, setExpandTierIndex] = useState(0);
    const [expanded, setExpanded] = useState(false);
    const [confirmQuit, setConfirmQuit] = useState(false);
    const [noticeGiven, setNoticeGiven] = useState(false);

    useEffect(() => {
        if (expanded) {
            setExpanded(false);
            setShowExpand(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [claim.maximumCapacity]);

    const { data: financials } = useQuery(trpc.simulation.getAgentFinancials.queryOptions({ agentId, planetId }));

    const invalidate = () => {
        void queryClient.invalidateQueries({
            queryKey: trpc.simulation.getPlanetClaims.queryKey({ planetId }),
        });
        void queryClient.invalidateQueries({
            queryKey: trpc.simulation.getAgentClaims.queryKey({ agentId, planetId }),
        });
    };

    const expandMutation = useMutation(
        trpc.expandClaim.mutationOptions({
            onSuccess: () => {
                setExpanded(true);
                invalidate();
            },
        }),
    );

    const quitMutation = useMutation(
        trpc.quitClaim.mutationOptions({
            onSuccess: () => {
                setConfirmQuit(false);
                invalidate();
            },
            onError: () => {
                setNoticeGiven(false);
            },
        }),
    );

    const fillPct = claim.maximumCapacity > 0 ? Math.round((claim.quantity / claim.maximumCapacity) * 100) : 0;
    const isSustainable = claim.depletionTicksEstimate === null;

    return (
        <Card className='border-emerald-500/30 flex flex-col'>
            <ClaimCardHeader resourceName={claim.resourceName} renewable={summary.renewable} />
            <CardContent className='flex flex-col gap-3 flex-1'>
                <p className='text-xs text-muted-foreground'>
                    Available: {formatNumbers(summary.availableCapacity)} of {formatNumbers(summary.totalCapacity)}
                </p>
                <div className='space-y-1'>
                    <div className='flex justify-between text-xs'>
                        <span className='text-muted-foreground'>Stock</span>
                        <span className='font-medium'>
                            {formatNumbers(claim.quantity)} / {formatNumbers(claim.maximumCapacity)} ({fillPct}%)
                        </span>
                    </div>
                    <div className='h-1.5 w-full rounded-full bg-secondary'>
                        <div className='h-1.5 rounded-full bg-emerald-500' style={{ width: `${fillPct}%` }} />
                    </div>
                </div>
                {claim.claimStatus === 'paused' && (
                    <Badge variant='outline' className='text-amber-600 border-amber-600 text-xs w-fit'>
                        Paused — insufficient funds
                    </Badge>
                )}
                <div className='grid grid-cols-2 gap-2 text-xs'>
                    <div className='space-y-0.5'>
                        <p className='text-muted-foreground'>Cost / tick</p>
                        <p className='font-medium'>
                            {summary.renewable
                                ? formatNumbers(claim.costPerTick)
                                : formatNumbers(claim.tenantCostInCoins)}
                        </p>
                    </div>
                    <div className='space-y-0.5'>
                        <p className='text-muted-foreground'>Regen / tick</p>
                        <p className='font-medium text-green-600 dark:text-green-400'>
                            +{formatNumbers(claim.regenerationRate)}
                        </p>
                    </div>
                    <div className='space-y-0.5'>
                        <p className='text-muted-foreground'>Extraction / tick</p>
                        <p className='font-medium'>{formatNumbers(claim.extractionRatePerTick)}</p>
                    </div>
                    <div className='space-y-0.5'>
                        <p className='text-muted-foreground'>Depletion</p>
                        <p
                            className={`font-medium flex items-center gap-1 ${isSustainable ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}
                        >
                            {isSustainable && <RefreshCw className='h-3 w-3' />}
                            {formatDepletion(claim.depletionTicksEstimate)}
                        </p>
                    </div>
                </div>

                {showExpand ? (
                    <div className='space-y-3 border-t pt-3 mt-auto'>
                        <div className='space-y-3'>
                            <div className='space-y-1'>
                                <div className='flex gap-2 text-xs text-muted-foreground pb-1'>
                                    {summary.renewable ? (
                                        <span className='flex gap-1'>
                                            Scale
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <InfoIcon className='h-4' />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    Measures the quantity of resource claimed by what the
                                                    least-demanding facility of this scale would sustainably be able to
                                                    consume.
                                                </TooltipContent>
                                            </Tooltip>
                                        </span>
                                    ) : (
                                        <span className='flex gap-1'>
                                            Scale-years{' '}
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <InfoIcon className='h-4' />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    1 Scale year can satisfy the annual consumption of one facility at
                                                    scale 1.
                                                </TooltipContent>
                                            </Tooltip>
                                        </span>
                                    )}
                                </div>
                                <Slider
                                    min={0}
                                    max={SY_TIERS.length - 1}
                                    step={1}
                                    value={[expandTierIndex]}
                                    onValueChange={([v]: [number]) => setExpandTierIndex(v ?? 0)}
                                    disabled={expandMutation.isPending || expanded}
                                />
                                <div className='relative h-4 text-[10px] text-muted-foreground'>
                                    {SY_TIERS.map((t, i) => {
                                        const pct = (i / (SY_TIERS.length - 1)) * 100 - 0.3 * (i - 2.3);
                                        const translate =
                                            i === 0 ? '100%' : i === SY_TIERS.length - 1 ? '-80%' : '-50%';
                                        return (
                                            <span
                                                key={t}
                                                className='absolute'
                                                style={{ left: `${pct}%`, transform: `translateX(${translate})` }}
                                            >
                                                {formatNumbers(t)}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                            {(() => {
                                const additionalQuantity = calcClaimQuantity(
                                    claim.resourceName,
                                    expandTierIndex,
                                    summary.renewable,
                                );
                                const cost = calcClaimCost(claim.resourceName, additionalQuantity);
                                const exceedsCapacity = additionalQuantity > summary.availableCapacity;
                                const deposits = financials?.deposits ?? 0;
                                const cannotAfford = !summary.renewable && cost > deposits;
                                const monthlyNetCashFlow = financials?.monthlyNetCashFlow ?? 0;
                                const perTickCashFlow = monthlyNetCashFlow / TICKS_PER_MONTH;
                                const cashFlowWarning = summary.renewable && cost > perTickCashFlow;
                                const isDisabled =
                                    exceedsCapacity || cannotAfford || expandMutation.isPending || expanded;

                                return (
                                    <>
                                        <div className='space-y-0.5 text-xs'>
                                            <div className='flex justify-between'>
                                                <span className='text-muted-foreground'>Quantity</span>
                                                <span
                                                    className={`font-medium ${exceedsCapacity ? 'text-destructive' : ''}`}
                                                >
                                                    {formatNumbers(additionalQuantity)} units
                                                    {exceedsCapacity && ' — exceeds available'}
                                                </span>
                                            </div>
                                            <div className='flex justify-between'>
                                                <span className='text-muted-foreground'>
                                                    {summary.renewable ? 'Cost / tick (locked)' : 'Cost (flat)'}
                                                </span>
                                                <span className='font-medium text-amber-600 dark:text-amber-400'>
                                                    {formatNumbers(cost)}
                                                </span>
                                            </div>
                                            {!summary.renewable ? (
                                                <div className='flex justify-between'>
                                                    <span className='text-muted-foreground'>Your deposits</span>
                                                    <span
                                                        className={`font-medium ${cannotAfford ? 'text-destructive' : ''}`}
                                                    >
                                                        {formatNumbers(deposits)}
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className='flex justify-between'>
                                                    <span className='text-muted-foreground'>Your cash flow</span>
                                                    {cashFlowWarning ? (
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <span className='font-medium text-amber-600 dark:text-amber-400'>
                                                                    {formatNumbers(perTickCashFlow)}
                                                                </span>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <span className='flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400'>
                                                                    <AlertTriangle className='h-3 w-3 shrink-0' />
                                                                    Running cost exceeds current cash flow
                                                                </span>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    ) : (
                                                        <span className='font-medium'>
                                                            {formatNumbers(perTickCashFlow)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className='flex gap-2'>
                                            <Button
                                                size='sm'
                                                disabled={isDisabled}
                                                onClick={() =>
                                                    expandMutation.mutate({
                                                        agentId,
                                                        planetId,
                                                        claimId: claim.claimId,
                                                        additionalQuantity,
                                                    })
                                                }
                                            >
                                                {expandMutation.isPending || expanded ? (
                                                    <>
                                                        <Loader2 className='h-3 w-3 animate-spin mr-1' />
                                                        Takes effect next tick…
                                                    </>
                                                ) : (
                                                    'Expand'
                                                )}
                                            </Button>
                                            <Button
                                                size='sm'
                                                variant='outline'
                                                disabled={expandMutation.isPending || expanded}
                                                onClick={() => setShowExpand(false)}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                        {expandMutation.error && (
                                            <p className='text-xs text-destructive'>{expandMutation.error.message}</p>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                ) : confirmQuit ? (
                    <div className='space-y-2 border-t pt-3 mt-auto'>
                        <p className='text-xs text-destructive font-medium'>
                            {summary.renewable
                                ? 'Billing continues until the claim is released.'
                                : 'There is no refund!'}
                        </p>
                        <div className='flex gap-2'>
                            <Button
                                size='sm'
                                variant='destructive'
                                disabled={quitMutation.isPending || noticeGiven}
                                onClick={() => {
                                    setNoticeGiven(true);
                                    quitMutation.mutate({ agentId, planetId, claimId: claim.claimId });
                                }}
                            >
                                {quitMutation.isPending || noticeGiven ? (
                                    <>
                                        <Loader2 className='h-3 w-3 animate-spin mr-1' />
                                        Takes effect next tick…
                                    </>
                                ) : summary.renewable ? (
                                    'Confirm Notice'
                                ) : (
                                    'Confirm Release'
                                )}
                            </Button>
                            <Button
                                size='sm'
                                variant='outline'
                                disabled={quitMutation.isPending || noticeGiven}
                                onClick={() => setConfirmQuit(false)}
                            >
                                Cancel
                            </Button>
                        </div>
                        {quitMutation.error && <p className='text-xs text-destructive'>{quitMutation.error.message}</p>}
                    </div>
                ) : (
                    <div className='flex gap-2 border-t pt-3 mt-auto'>
                        {summary.availableCapacity > 0 && claim.noticePeriodEndsAtTick === null && !noticeGiven && (
                            <Button size='sm' variant='outline' onClick={() => setShowExpand(true)}>
                                Expand
                            </Button>
                        )}
                        {claim.noticePeriodEndsAtTick === null && !noticeGiven && (
                            <Button size='sm' variant='outline' onClick={() => setConfirmQuit(true)}>
                                {summary.renewable ? 'Give Notice' : 'Release'}
                            </Button>
                        )}
                    </div>
                )}
                {claim.noticePeriodEndsAtTick !== null && (
                    <Badge variant='outline' className='text-red-600 border-red-600 text-xs w-fit'>
                        Claim ends: {mapTickToDate(claim.noticePeriodEndsAtTick)}
                    </Badge>
                )}
            </CardContent>
        </Card>
    );
}
