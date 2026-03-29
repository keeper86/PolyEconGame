'use client';

import React from 'react';
import {
    ArrowDownRight,
    ArrowUpRight,
    Coins,
    Landmark,
    Minus,
    ShoppingCart,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import { RETAINED_EARNINGS_THRESHOLD } from '@/simulation/constants';
import type { AgentMarketOfferState } from '@/simulation/planet/planet';
import { formatNumbers } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Props = {
    /** Firm deposit balance on this planet (currency units). */
    deposits: number;
    /** Outstanding loan principal on this planet (currency units). */
    loans: number;
    /** Actual wage bill computed by the last pre-production financial tick. */
    lastWageBill: number;
    /** Per-agent food market pricing & history. */
    foodMarket?: Partial<AgentMarketOfferState>;
};

/* ------------------------------------------------------------------ */
/*  Stat row                                                           */
/* ------------------------------------------------------------------ */

function Stat({
    label,
    value,
    icon,
    valueClassName,
}: {
    label: string;
    value: React.ReactNode;
    icon?: React.ReactNode;
    valueClassName?: string;
}): React.ReactElement {
    return (
        <div className='flex items-baseline justify-between gap-2'>
            <span className='flex items-center gap-1 text-xs text-muted-foreground truncate'>
                {icon}
                {label}
            </span>
            <span className={`tabular-nums whitespace-nowrap text-xs font-medium ${valueClassName ?? ''}`}>
                {value}
            </span>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentFinancialOverview({
    deposits,
    loans,
    lastWageBill,
    foodMarket,
}: Props): React.ReactElement {
    const netPosition = deposits - loans;
    const retainedThreshold = lastWageBill * RETAINED_EARNINGS_THRESHOLD;
    const excessDeposits = Math.max(0, deposits - retainedThreshold);
    const cashCoversTicks = lastWageBill > 0 && deposits > 0 ? Math.floor(deposits / lastWageBill) : null;

    return (
        <div className='space-y-3'>
            {/* Balance sheet */}
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1'>
                <Stat
                    label='Firm deposits'
                    value={formatNumbers(deposits)}
                    icon={<Coins className='h-3 w-3' />}
                    valueClassName={deposits < 0 ? 'text-red-500' : deposits === 0 ? 'text-muted-foreground' : ''}
                />
                <Stat
                    label='Outstanding loans'
                    value={formatNumbers(loans)}
                    icon={<TrendingDown className='h-3 w-3' />}
                    valueClassName={loans > 0 ? 'text-amber-500' : 'text-muted-foreground'}
                />
                <Stat
                    label='Net position (deposits − loans)'
                    value={formatNumbers(netPosition)}
                    icon={netPosition >= 0 ? <TrendingUp className='h-3 w-3' /> : <TrendingDown className='h-3 w-3' />}
                    valueClassName={netPosition < 0 ? 'text-red-500' : netPosition > 0 ? 'text-green-600' : ''}
                />
            </div>

            {/* Wage bill & cash flow */}
            {lastWageBill > 0 && (
                <>
                    <Separator />
                    <div>
                        <div className='flex items-center gap-1 text-xs text-muted-foreground mb-1'>
                            <Landmark className='h-3 w-3' />
                            Cash flow
                        </div>
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1'>
                            <Stat
                                label='Last wage bill / tick'
                                value={formatNumbers(lastWageBill)}
                                icon={<ArrowDownRight className='h-3 w-3' />}
                                valueClassName='text-amber-500'
                            />
                            {cashCoversTicks !== null && (
                                <Stat
                                    label='Ticks of cash coverage'
                                    value={cashCoversTicks}
                                    icon={<TrendingUp className='h-3 w-3' />}
                                    valueClassName={cashCoversTicks < 2 ? 'text-red-500' : 'text-green-600'}
                                />
                            )}
                            <Stat
                                label={`Retained threshold (${RETAINED_EARNINGS_THRESHOLD}× wage bill)`}
                                value={formatNumbers(retainedThreshold)}
                                icon={<Minus className='h-3 w-3' />}
                            />
                            <Stat
                                label='Excess deposits (avail. for repayment)'
                                value={formatNumbers(excessDeposits)}
                                icon={<ArrowUpRight className='h-3 w-3' />}
                                valueClassName={excessDeposits > 0 ? 'text-green-600' : 'text-muted-foreground'}
                            />
                        </div>
                    </div>
                </>
            )}

            {/* Food market */}
            {foodMarket && (
                <>
                    <Separator />
                    <div>
                        <div className='flex items-center gap-1 text-xs text-muted-foreground mb-1'>
                            <ShoppingCart className='h-3 w-3' />
                            Food market
                        </div>
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1'>
                            {foodMarket.offerPrice != null && (
                                <Stat label='Offer price' value={formatNumbers(foodMarket.offerPrice)} />
                            )}
                            {foodMarket.offerRetainment != null && (
                                <Stat label='Retainment' value={formatNumbers(foodMarket.offerRetainment)} />
                            )}
                            {foodMarket.lastSold != null && (
                                <Stat label='Last sold (qty)' value={formatNumbers(foodMarket.lastSold)} />
                            )}
                            {foodMarket.lastRevenue != null && (
                                <Stat
                                    label='Last revenue'
                                    value={formatNumbers(foodMarket.lastRevenue)}
                                    icon={<Coins className='h-3 w-3' />}
                                    valueClassName={
                                        foodMarket.lastRevenue > 0 ? 'text-green-600' : 'text-muted-foreground'
                                    }
                                />
                            )}
                            {foodMarket.priceDirection != null && (
                                <Stat
                                    label='Price direction'
                                    value={
                                        foodMarket.priceDirection > 0
                                            ? `↑ +${foodMarket.priceDirection.toFixed(4)}`
                                            : foodMarket.priceDirection < 0
                                              ? `↓ ${foodMarket.priceDirection.toFixed(4)}`
                                              : '→ 0'
                                    }
                                    valueClassName={
                                        foodMarket.priceDirection > 0
                                            ? 'text-green-600'
                                            : foodMarket.priceDirection < 0
                                              ? 'text-red-500'
                                              : ''
                                    }
                                />
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
