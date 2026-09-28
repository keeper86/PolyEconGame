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
import { resourceNameToSlug } from '@/app/planets/[planetId]/agent/[agentId]/market/_components/marketHelpers';
import { useLocale, useTranslations } from 'next-intl';

type ClaimsTranslator = ReturnType<typeof useTranslations<'Claims'>>;

function formatDepletion(t: ClaimsTranslator, ticks: number | null): string {
    if (ticks === null) {
        return t('sustainable');
    }
    const months = Math.floor(ticks / TICKS_PER_MONTH);
    if (months < MONTHS_PER_YEAR) {
        return t('depletionMonths', { count: months });
    }
    const years = Math.floor(months / MONTHS_PER_YEAR);
    const remMonths = months % MONTHS_PER_YEAR;
    return remMonths > 0
        ? t('depletionYearsMonths', { years, months: remMonths })
        : t('depletionYears', { count: years });
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
    const locale = useLocale();
    const t = useTranslations('Claims');
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
        <Card
            id={resourceNameToSlug(claim.resourceName)}
            className='border-emerald-500/30 flex flex-col'
            data-tour='claims-active'
        >
            <ClaimCardHeader resourceName={claim.resourceName} renewable={summary.renewable} />
            <CardContent className='flex flex-col gap-3 flex-1'>
                <p className='text-xs text-muted-foreground'>
                    {t('available', {
                        current: formatNumberWithUnit(summary.availableCapacity, 'units', undefined, locale),
                        total: formatNumberWithUnit(summary.totalCapacity, 'units', undefined, locale),
                    })}
                </p>
                <div className='space-y-1'>
                    <div className='flex justify-between text-xs'>
                        <span className='text-muted-foreground'>{t('stock')}</span>
                        <span className='font-medium'>
                            {formatNumberWithUnit(claim.quantity, 'units', undefined, locale)} /{' '}
                            {formatNumberWithUnit(claim.maximumCapacity, 'units', undefined, locale)} ({fillPct}%)
                        </span>
                    </div>
                    <div className='h-1.5 w-full rounded-full bg-secondary'>
                        <div className='h-1.5 rounded-full bg-emerald-500' style={{ width: `${fillPct}%` }} />
                    </div>
                </div>
                {claim.claimStatus === 'paused' && (
                    <Badge variant='outline' className='text-amber-600 border-amber-600 text-xs w-fit'>
                        {t('paused')}
                    </Badge>
                )}
                <div className='grid grid-cols-2 gap-2 text-xs'>
                    <div className='space-y-0.5'>
                        <p className='text-muted-foreground'>{t('extractionPerTick')}</p>
                        <p className='font-medium'>
                            {formatNumberWithUnit(claim.extractionRatePerTick, 'units', undefined, locale)}
                        </p>
                    </div>
                    <div className='space-y-0.5'>
                        <p className='text-muted-foreground'>{t('depletion')}</p>
                        <p
                            className={`font-medium flex items-center gap-1 ${isSustainable ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}
                        >
                            {isSustainable && <RefreshCw className='h-3 w-3' />}
                            {formatDepletion(t, claim.depletionTicksEstimate)}
                        </p>
                    </div>
                    {summary.renewable && (
                        <>
                            <div className='space-y-0.5'>
                                <p className='text-muted-foreground'>{t('costPerTick')}</p>
                                <p className='font-medium'>
                                    {formatNumberWithUnit(claim.costPerTick, 'currency', planetId, locale)}
                                </p>
                            </div>
                            <div className='space-y-0.5'>
                                <p className='text-muted-foreground'>{t('regenPerTick')}</p>
                                <p className='font-medium text-green-600 dark:text-green-400'>
                                    +{formatNumberWithUnit(claim.regenerationRate, 'units', undefined, locale)}
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
                            submitLabel={t('expand')}
                            errorMessage={expandMutation.error?.message}
                        />
                    </div>
                ) : confirmQuit ? (
                    <div className='space-y-2 border-t pt-3 mt-auto'>
                        <p className='text-xs text-destructive font-medium'>
                            {summary.renewable ? t('billingContinues') : t('noRefund')}
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
                                        {t('takesEffectNextTick')}
                                    </>
                                ) : summary.renewable ? (
                                    t('confirmNotice')
                                ) : (
                                    t('confirmRelease')
                                )}
                            </Button>
                            <Button
                                size='sm'
                                variant='destructive'
                                disabled={quitMutation.isPending || noticeGiven}
                                onClick={() => setConfirmQuit(false)}
                            >
                                {t('cancel')}
                            </Button>
                        </div>
                        {quitMutation.error && <p className='text-xs text-destructive'>{quitMutation.error.message}</p>}
                    </div>
                ) : (
                    <div className='flex gap-2 border-t pt-3 mt-auto'>
                        {summary.availableCapacity > 0 && claim.noticePeriodEndsAtTick === null && !noticeGiven && (
                            <Button size='sm' variant='outline' onClick={() => setShowExpand(true)}>
                                {t('expand')}
                            </Button>
                        )}
                        {claim.noticePeriodEndsAtTick === null && !noticeGiven && (
                            <Button size='sm' variant='outline' onClick={() => setConfirmQuit(true)}>
                                {summary.renewable ? t('giveNotice') : t('release')}
                            </Button>
                        )}
                    </div>
                )}
                {claim.noticePeriodEndsAtTick !== null && (
                    <Badge variant='outline' className='text-red-600 border-red-600 text-xs w-fit'>
                        {t('claimEnds', { date: mapTickToDate(claim.noticePeriodEndsAtTick, false, locale) })}
                    </Badge>
                )}
            </CardContent>
        </Card>
    );
}
