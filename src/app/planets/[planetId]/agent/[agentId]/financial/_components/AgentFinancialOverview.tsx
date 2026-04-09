'use client';

import { formatNumbers } from '@/lib/utils';
import { Coins, TrendingDown, TrendingUp } from 'lucide-react';
import React from 'react';

type Props = {
    deposits: number;
    loans: number;
    loanConditions: {
        blendedMonthlyRevenue: number;
        blendedMonthlyExpenses: number;
        monthlyNetCashFlow: number;
    };
};

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

export default function AgentFinancialOverview({ deposits, loans, loanConditions }: Props): React.ReactElement {
    const netPosition = deposits - loans;

    return (
        <div className='space-y-3'>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2'>
                <div className='grid grid-cols-1 gap-y-1'>
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
                        valueClassName={
                            loans === 0 ? 'text-muted-foreground' : loans > deposits ? 'text-red-500' : 'text-amber-500'
                        }
                    />
                    <Stat
                        label='Net position (deposits − loans)'
                        value={formatNumbers(netPosition)}
                        icon={
                            netPosition >= 0 ? <TrendingUp className='h-3 w-3' /> : <TrendingDown className='h-3 w-3' />
                        }
                        valueClassName={
                            netPosition < 0
                                ? 'text-red-500'
                                : netPosition > 0
                                  ? 'text-green-600'
                                  : 'text-muted-foreground'
                        }
                    />
                </div>
                <div className='grid grid-cols-1 gap-x-6 gap-y-1'>
                    <Stat
                        label='Monthly revenue (projected)'
                        value={formatNumbers(loanConditions.blendedMonthlyRevenue)}
                    />
                    <Stat
                        label='Monthly expenses (projected)'
                        value={formatNumbers(loanConditions.blendedMonthlyExpenses)}
                        valueClassName={
                            loanConditions.blendedMonthlyExpenses === 0
                                ? 'text-muted-foreground'
                                : loanConditions.blendedMonthlyExpenses > loanConditions.blendedMonthlyRevenue
                                  ? 'text-red-500'
                                  : 'text-amber-500'
                        }
                    />
                    <Stat
                        label='Net monthly cash flow (projected)'
                        value={formatNumbers(loanConditions.monthlyNetCashFlow)}
                        valueClassName={
                            loanConditions.monthlyNetCashFlow === 0
                                ? 'text-muted-foreground'
                                : loanConditions.monthlyNetCashFlow > 0
                                  ? 'text-green-600'
                                  : 'text-red-500'
                        }
                    />
                </div>
            </div>
        </div>
    );
}
