'use client';

import { mapTickToDate } from '@/components/client/TickDisplay';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import type { AgentClaimEntry, ClaimResourceSummary } from '@/server/controller/planet';
import { MONTHS_PER_YEAR, TICKS_PER_MONTH } from '@/simulation/constants';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { ClaimCardHeader } from './ClaimCardHeader';
import { ClaimSizeForm } from './ClaimSizeForm';

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

    const { data: financials } = useSimulationQuery(
        trpc.simulation.getAgentFinancials.queryOptions({ agentId, planetId }),
    );

    const invalidate = () => {
        void queryClient.invalidateQueries({
            queryKey: trpc.simulation.getPlanetClaims.queryKey({ planetId }),
        });
        void queryClient.invalidateQueries({
            queryKey: trpc.simulation.getAgentClaims.queryKey({ agentId, planetId }),
        });
    };

    const expandMutation = useMutation(
        trpc.leaseClaim.mutationOptions({
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
                    Available: {formatNumberWithUnit(summary.availableCapacity, 'units')} of{' '}
                    {formatNumberWithUnit(summary.totalCapacity, 'units')}
                </p>
                <div className='space-y-1'>
                    <div className='flex justify-between text-xs'>
                        <span className='text-muted-foreground'>Stock</span>
                        <span className='font-medium'>
                            {formatNumberWithUnit(claim.quantity, 'units')} /{' '}
                            {formatNumberWithUnit(claim.maximumCapacity, 'units')} ({fillPct}%)
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
                        <p className='text-muted-foreground'>Extraction / tick</p>
                        <p className='font-medium'>{formatNumberWithUnit(claim.extractionRatePerTick, 'units')}</p>
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
                    {summary.renewable && (
                        <>
                            <div className='space-y-0.5'>
                                <p className='text-muted-foreground'>Cost / tick</p>
                                <p className='font-medium'>
                                    {formatNumberWithUnit(claim.costPerTick, 'currency', planetId)}
                                </p>
                            </div>
                            <div className='space-y-0.5'>
                                <p className='text-muted-foreground'>Regen / tick</p>
                                <p className='font-medium text-green-600 dark:text-green-400'>
                                    +{formatNumberWithUnit(claim.regenerationRate, 'units')}
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {showExpand ? (
                    <div className='space-y-3 border-t pt-3 mt-auto'>
                        <ClaimSizeForm
                            summary={summary}
                            planetId={planetId}
                            financials={financials}
                            tierIndex={expandTierIndex}
                            onTierChange={setExpandTierIndex}
                            isPending={expandMutation.isPending}
                            isSubmitted={expanded}
                            onSubmit={(additionalQuantity) =>
                                expandMutation.mutate({
                                    agentId,
                                    planetId,
                                    resourceName: claim.resourceName,
                                    quantity: additionalQuantity,
                                })
                            }
                            onCancel={() => setShowExpand(false)}
                            submitLabel='Expand'
                            errorMessage={expandMutation.error?.message}
                        />
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
