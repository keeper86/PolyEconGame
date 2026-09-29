'use client';

import { Button } from '@/components/ui/button';
import { LogSlider } from '@/components/ui/log-slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatNumberWithUnit } from '@/lib/utils';
import type { ClaimResourceSummary } from '@/server/controller/planet';
import { TICKS_PER_MONTH } from '@/simulation/constants';
import { AlertTriangle, InfoIcon, Loader2 } from 'lucide-react';
import React from 'react';
import { SY_TIERS, calcClaimCost, calcClaimQuantity } from './claimCalculations';
import { useLocale, useTranslations } from 'next-intl';

interface ClaimSizeFormProps {
    planetId: string;
    summary: ClaimResourceSummary;
    financials: { deposits: number; monthlyNetCashFlow: number } | undefined;
    tierIndex: number;
    onTierChange: (index: number) => void;
    isPending: boolean;
    isSubmitted: boolean;
    onSubmit: (quantity: number) => void;
    onCancel?: () => void;
    submitLabel: string;
    errorMessage?: string | null;
}

export function ClaimSizeForm({
    summary,
    planetId,
    financials,
    tierIndex,
    onTierChange,
    isPending,
    isSubmitted,
    onSubmit,
    onCancel,
    submitLabel,
    errorMessage,
}: ClaimSizeFormProps): React.ReactElement {
    const locale = useLocale();
    const t = useTranslations('Claims');
    const quantity = calcClaimQuantity(summary.resourceName, tierIndex, summary.renewable);
    const cost = calcClaimCost(summary.resourceName, quantity);
    const upfrontCost = summary.renewable ? cost * TICKS_PER_MONTH : cost;

    const deposits = financials?.deposits ?? 0;
    const monthlyNetCashFlow = financials?.monthlyNetCashFlow ?? 0;
    const perTickCashFlow = monthlyNetCashFlow / TICKS_PER_MONTH;

    const exceedsCapacity = quantity > summary.availableCapacity;
    const cannotAfford = upfrontCost > deposits;
    const cashFlowWarning = summary.renewable && cost > perTickCashFlow;
    const isDisabled = exceedsCapacity || cannotAfford || isPending || isSubmitted;

    return (
        <div className='space-y-3'>
            <div className='space-y-1'>
                <div className='flex gap-2 text-xs text-muted-foreground pb-1'>
                    {summary.renewable ? (
                        <span className='flex gap-1'>
                            {t('scale')}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <InfoIcon className='h-4' />
                                </TooltipTrigger>
                                <TooltipContent>{t('scaleTooltip')}</TooltipContent>
                            </Tooltip>
                        </span>
                    ) : (
                        <span className='flex gap-1'>
                            {t('scaleYears')}{' '}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <InfoIcon className='h-4' />
                                </TooltipTrigger>
                                <TooltipContent>{t('scaleYearsTooltip')}</TooltipContent>
                            </Tooltip>
                        </span>
                    )}
                </div>
                <LogSlider
                    values={[...SY_TIERS]}
                    value={tierIndex}
                    onValueChange={onTierChange}
                    disabled={isPending || isSubmitted}
                    formatLabel={(v) => formatNumberWithUnit(v, 'units', undefined, locale)}
                    className='pt-2'
                />
            </div>

            <div className='space-y-0.5 text-xs'>
                <div className='flex justify-between'>
                    <span className='text-muted-foreground'>{t('quantity')}</span>
                    <span className={`font-medium ${exceedsCapacity ? 'text-destructive' : ''}`}>
                        {formatNumberWithUnit(quantity, 'units', undefined, locale)}
                        {exceedsCapacity && t('exceedsAvailable')}
                    </span>
                </div>
                {summary.renewable && (
                    <>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>{t('upfront')}</span>
                            <span
                                className={`font-medium ${cannotAfford ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}
                            >
                                {formatNumberWithUnit(upfrontCost, 'currency', planetId, locale)}
                            </span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>{t('yourDeposits')}</span>
                            <span className={`font-medium ${cannotAfford ? 'text-destructive' : ''}`}>
                                {formatNumberWithUnit(deposits, 'currency', planetId, locale)}
                            </span>
                        </div>
                    </>
                )}
                <div className='flex justify-between'>
                    <span className='text-muted-foreground'>
                        {summary.renewable ? t('costPerTickOngoing') : t('costFlat')}
                    </span>
                    <span className='font-medium text-amber-600 dark:text-amber-400'>
                        {formatNumberWithUnit(cost, 'currency', planetId, locale)}
                    </span>
                </div>
                {!summary.renewable ? (
                    <div className='flex justify-between'>
                        <span className='text-muted-foreground'>{t('yourDeposits')}</span>
                        <span className={`font-medium ${cannotAfford ? 'text-destructive' : ''}`}>
                            {formatNumberWithUnit(deposits, 'currency', planetId, locale)}
                        </span>
                    </div>
                ) : (
                    <div className='flex justify-between'>
                        <span className='text-muted-foreground'>{t('yourCashFlow')}</span>
                        {cashFlowWarning ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className='font-medium text-amber-600 dark:text-amber-400'>
                                        {formatNumberWithUnit(perTickCashFlow, 'currency', planetId, locale)}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <span className='flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400'>
                                        <AlertTriangle className='h-3 w-3 shrink-0' />
                                        {t('runningCostExceeds')}
                                    </span>
                                </TooltipContent>
                            </Tooltip>
                        ) : (
                            <span className='font-medium'>
                                {formatNumberWithUnit(perTickCashFlow, 'currency', planetId, locale)}
                            </span>
                        )}
                    </div>
                )}
            </div>
            {errorMessage && <p className='text-xs text-destructive'>{errorMessage}</p>}
            <div className={onCancel ? 'flex gap-2' : ''}>
                <Button
                    size='sm'
                    disabled={isDisabled}
                    onClick={() => onSubmit(quantity)}
                    className={onCancel ? '' : 'w-full'}
                >
                    {isPending || isSubmitted ? (
                        <>
                            <Loader2 className='h-3 w-3 animate-spin mr-1' />
                            {t('takesEffectNextTick')}
                        </>
                    ) : (
                        submitLabel
                    )}
                </Button>
                {onCancel && (
                    <Button size='sm' variant='destructive' disabled={isPending || isSubmitted} onClick={onCancel}>
                        {t('cancel')}
                    </Button>
                )}
            </div>
        </div>
    );
}
