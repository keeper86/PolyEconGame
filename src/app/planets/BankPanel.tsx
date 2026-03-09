'use client';

import React from 'react';
import { Coins, Landmark, Percent, Scale, TrendingDown, TrendingUp, Wallet, Users } from 'lucide-react';
import type { Bank } from '@/simulation/planet/planet';
import { DEFAULT_WAGE_PER_EDU } from '@/simulation/financial/financialTick';
import type { EducationLevelType } from '@/simulation/population/education';
import { educationLevelKeys } from '@/simulation/population/education';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n: number): string =>
    !n
        ? '0'
        : n >= 1_000_000
          ? `${(n / 1_000_000).toFixed(2)}M`
          : n >= 1_000
            ? `${(n / 1_000).toFixed(1)}k`
            : n.toFixed(2);

const pct = (n: number): string => `${(n * 100).toFixed(2)} %`;

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
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type Props = {
    bank?: Bank;
    wagePerEdu?: Partial<Record<EducationLevelType, number>>;
    priceLevel?: number;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BankPanel({ bank, wagePerEdu, priceLevel }: Props): React.ReactElement | null {
    // Don't render anything until the financial tick has run at least once.
    if (!bank && !wagePerEdu && priceLevel === undefined) {
        return null;
    }

    const equityColor = bank && bank.equity < 0 ? 'text-red-500' : bank && bank.equity > 0 ? 'text-green-600' : '';

    return (
        <div className='mt-4 border rounded-md p-3 space-y-3'>
            {/* Header */}
            <div className='flex items-center gap-2'>
                <Landmark className='h-4 w-4 text-muted-foreground' />
                <span className='text-sm font-semibold'>Planetary Bank</span>
            </div>

            {/* Bank balance sheet */}
            {bank ? (
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1'>
                    <Stat
                        label='Outstanding loans'
                        value={fmt(bank.loans)}
                        icon={<TrendingDown className='h-3 w-3' />}
                        valueClassName={bank.loans > 0 ? 'text-amber-500' : ''}
                    />
                    <Stat label='Money supply' value={fmt(bank.deposits)} icon={<TrendingUp className='h-3 w-3' />} />
                    <Stat
                        label='Firm deposits'
                        value={fmt(bank.deposits - bank.householdDeposits)}
                        icon={<Wallet className='h-3 w-3' />}
                    />
                    <Stat
                        label='Household deposits'
                        value={fmt(bank.householdDeposits)}
                        icon={<Users className='h-3 w-3' />}
                    />
                    <Stat
                        label='Bank equity'
                        value={fmt(bank.equity)}
                        icon={<Scale className='h-3 w-3' />}
                        valueClassName={equityColor}
                    />
                    <Stat label='Loan rate' value={pct(bank.loanRate)} icon={<Percent className='h-3 w-3' />} />
                    <Stat label='Deposit rate' value={pct(bank.depositRate)} icon={<Percent className='h-3 w-3' />} />
                    {priceLevel !== undefined && (
                        <Stat label='Price level' value={priceLevel.toFixed(4)} icon={<Coins className='h-3 w-3' />} />
                    )}
                </div>
            ) : (
                <div className='text-xs text-muted-foreground'>Bank not yet initialised (no financial tick run).</div>
            )}

            {/* Wages per education level */}
            <div>
                <div className='flex items-center gap-1 text-xs text-muted-foreground mb-1'>
                    <Coins className='h-3 w-3' />
                    Wage per worker / tick
                </div>
                <div className='grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5'>
                    {educationLevelKeys.map((edu) => {
                        const wage = wagePerEdu?.[edu] ?? DEFAULT_WAGE_PER_EDU;
                        return (
                            <div key={edu} className='flex items-baseline justify-between text-xs gap-2'>
                                <span className='text-muted-foreground capitalize'>{edu}</span>
                                <span className='tabular-nums font-medium'>{fmt(wage)}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
            {/* Debug: raw bank object (dev only) */}
            {process.env.NODE_ENV === 'development' && bank ? (
                <details className='text-xs text-muted-foreground mt-2'>
                    <summary className='cursor-pointer'>Raw bank snapshot</summary>
                    <pre className='mt-2 overflow-auto max-h-48 p-2 bg-gray-50 text-[11px]'>
                        {JSON.stringify(bank, null, 2)}
                    </pre>
                </details>
            ) : null}
        </div>
    );
}
