'use client';

import { formatNumbers } from '@/lib/utils';
import { DEFAULT_WAGE_PER_EDU } from '@/simulation/financial/financialTick';
import type { Bank } from '@/simulation/planet/planet';
import type { EducationLevelType } from '@/simulation/population/education';
import { educationLevelKeys } from '@/simulation/population/education';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Coins, Landmark, Percent, Scale, TrendingDown, Users, Wallet } from 'lucide-react';
import React from 'react';
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
        <Card className='mt-4'>
            <CardHeader className='pb-2 pt-3 px-3'>
                <CardTitle className='text-sm font-semibold flex items-center gap-2'>
                    <Landmark className='h-4 w-4 text-muted-foreground' />
                    Planetary Bank
                </CardTitle>
            </CardHeader>

            <CardContent className='px-3 pb-3 space-y-3'>
                {bank ? (
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1'>
                        <Stat
                            label='Outstanding loans'
                            value={formatNumbers(bank.loans)}
                            icon={<TrendingDown className='h-3 w-3' />}
                            valueClassName={bank.loans > 0 ? 'text-amber-500' : ''}
                        />
                        <Stat label='Loan rate' value={pct(bank.loanRate)} icon={<Percent className='h-3 w-3' />} />

                        <Stat
                            label='Household deposits'
                            value={formatNumbers(bank.householdDeposits)}
                            icon={<Users className='h-3 w-3' />}
                        />
                        <Stat
                            label='Bank equity'
                            value={formatNumbers(bank.equity)}
                            icon={<Scale className='h-3 w-3' />}
                            valueClassName={equityColor}
                        />
                        <Stat
                            label='Firm deposits'
                            value={formatNumbers(bank.deposits - bank.householdDeposits)}
                            icon={<Wallet className='h-3 w-3' />}
                        />
                        <Stat
                            label='Deposit rate'
                            value={pct(bank.depositRate)}
                            icon={<Percent className='h-3 w-3' />}
                        />
                    </div>
                ) : (
                    <p className='text-xs text-muted-foreground'>Bank not yet initialised (no financial tick run).</p>
                )}

                <Separator />

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
                                    <span className='tabular-nums font-medium'>{formatNumbers(wage)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
