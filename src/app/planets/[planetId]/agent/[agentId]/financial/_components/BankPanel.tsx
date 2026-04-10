'use client';

import { formatNumbers } from '@/lib/utils';
import type { Bank } from '@/simulation/planet/planet';
import { Landmark, Percent, Scale, TrendingDown, Users, Wallet } from 'lucide-react';
import React from 'react';
const pct = (n: number): string => `${(n * 100).toFixed(2)} %`;

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

type Props = {
    bank: Bank;
};

export default function BankPanel({ bank }: Props): React.ReactElement | null {
    const equityColor = bank.equity < 0 ? 'text-red-500' : bank.equity > 0 ? 'text-green-600' : '';

    return (
        <>
            <p className='text-sm font-semibold flex items-center gap-2'>
                <Landmark className='h-4 w-4 text-muted-foreground' />
                Planetary Bank
            </p>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2'>
                <div className='grid grid-cols-1 gap-y-1'>
                    <Stat
                        label='Outstanding loans'
                        value={formatNumbers(bank.loans)}
                        icon={<TrendingDown className='h-3 w-3' />}
                        valueClassName={bank.loans > 0 ? 'text-amber-500' : ''}
                    />
                    <Stat
                        label='Firm deposits'
                        value={formatNumbers(bank.deposits - bank.householdDeposits)}
                        icon={<Wallet className='h-3 w-3' />}
                    />

                    <Stat
                        label='Household deposits'
                        value={formatNumbers(bank.householdDeposits)}
                        icon={<Users className='h-3 w-3' />}
                    />
                </div>
                <div className='grid grid-cols-1 gap-y-1'>
                    <Stat
                        label='Bank equity'
                        value={formatNumbers(bank.equity)}
                        icon={<Scale className='h-3 w-3' />}
                        valueClassName={equityColor}
                    />
                    <Stat label='Loan rate' value={pct(bank.loanRate)} icon={<Percent className='h-3 w-3' />} />

                    <Stat label='Deposit rate' value={pct(bank.depositRate)} icon={<Percent className='h-3 w-3' />} />
                </div>
            </div>
        </>
    );
}
