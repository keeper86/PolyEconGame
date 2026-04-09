'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { AlertTriangle, InfoIcon, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatNumbers } from '@/lib/utils';
import { TICKS_PER_MONTH } from '@/simulation/constants';
import type { ClaimResourceSummary } from '@/server/controller/planet';
import { SY_TIERS, calcClaimQuantity, calcClaimCost } from './claimCalculations';

interface ClaimSizeFormProps {
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
                            Scale
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <InfoIcon className='h-4' />
                                </TooltipTrigger>
                                <TooltipContent>
                                    Measures the quantity of resource claimed by what the least-demanding facility of
                                    this scale would sustainably be able to consume.
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
                                    1 Scale year can satisfy the annual consumption of one facility at scale 1.
                                </TooltipContent>
                            </Tooltip>
                        </span>
                    )}
                </div>
                <Slider
                    min={0}
                    max={SY_TIERS.length - 1}
                    step={1}
                    value={[tierIndex]}
                    onValueChange={([v]) => onTierChange(v ?? 0)}
                    disabled={isPending || isSubmitted}
                />
                <div className='relative h-4 text-[10px] text-muted-foreground'>
                    {SY_TIERS.map((t, i) => {
                        const pct = (i / (SY_TIERS.length - 1)) * 100 - 0.3 * (i - 2.3);
                        const translate = i === 0 ? '100%' : i === SY_TIERS.length - 1 ? '-80%' : '-50%';
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
            <div className='space-y-0.5 text-xs'>
                <div className='flex justify-between'>
                    <span className='text-muted-foreground'>Quantity</span>
                    <span className={`font-medium ${exceedsCapacity ? 'text-destructive' : ''}`}>
                        {formatNumbers(quantity)} units
                        {exceedsCapacity && ' — exceeds available'}
                    </span>
                </div>
                {summary.renewable && (
                    <>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Upfront (1 month)</span>
                            <span
                                className={`font-medium ${cannotAfford ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}
                            >
                                {formatNumbers(upfrontCost)}
                            </span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Your deposits</span>
                            <span className={`font-medium ${cannotAfford ? 'text-destructive' : ''}`}>
                                {formatNumbers(deposits)}
                            </span>
                        </div>
                    </>
                )}
                <div className='flex justify-between'>
                    <span className='text-muted-foreground'>
                        {summary.renewable ? 'Cost / tick (ongoing)' : 'Cost (flat)'}
                    </span>
                    <span className='font-medium text-amber-600 dark:text-amber-400'>{formatNumbers(cost)}</span>
                </div>
                {!summary.renewable ? (
                    <div className='flex justify-between'>
                        <span className='text-muted-foreground'>Your deposits</span>
                        <span className={`font-medium ${cannotAfford ? 'text-destructive' : ''}`}>
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
                            <span className='font-medium'>{formatNumbers(perTickCashFlow)}</span>
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
                            Takes effect next tick…
                        </>
                    ) : (
                        submitLabel
                    )}
                </Button>
                {onCancel && (
                    <Button size='sm' variant='outline' disabled={isPending || isSubmitted} onClick={onCancel}>
                        Cancel
                    </Button>
                )}
            </div>
        </div>
    );
}
