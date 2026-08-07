'use client';

import { Separator } from '@/components/ui/separator';
import { formatNumberWithUnit } from '@/lib/utils';
import Link from 'next/link';
import React from 'react';

export function FacilityFinancialRow({
    lastTickResults,
    planetId,
    agentId,
}: {
    lastTickResults: { revenue?: number; inputCosts: number; wageCosts: number; costBalance: number };
    planetId: string;
    agentId: string;
}): React.ReactElement {
    return (
        <Link href={`/planets/${planetId}/agent/${agentId}/financial` as never}>
            <Separator />
            <div className='py-1 flex flex-row items-center justify-center gap-3 text-[14px] text-muted-foreground bg-muted/80 w-full hover:ring-2 hover:ring-primary/50'>
                {'revenue' in lastTickResults && (
                    <>
                        <div className='flex flex-col items-center'>
                            {' '}
                            revenue{' '}
                            <span className='tabular-nums text-green-600 dark:text-green-400'>
                                {formatNumberWithUnit(lastTickResults.revenue ?? 0, 'currency', planetId)}
                            </span>
                        </div>
                        <span className='shrink-0'>−</span>
                    </>
                )}

                <div className='flex flex-col items-center'>
                    {' '}
                    inputs{' '}
                    <span className='tabular-nums text-red-600 dark:text-red-400'>
                        {formatNumberWithUnit(lastTickResults.inputCosts, 'currency', planetId)}
                    </span>
                </div>

                <span className='shrink-0'>−</span>

                <div className='flex flex-col items-center'>
                    {' '}
                    wages{' '}
                    <span className='tabular-nums text-red-600 dark:text-red-400'>
                        {formatNumberWithUnit(lastTickResults.wageCosts, 'currency', planetId)}
                    </span>
                </div>

                <span className='shrink-0'>=</span>

                <div className='flex flex-col items-center text-foreground'>
                    {' '}
                    net/day{' '}
                    <span
                        className={`tabular-nums text-md ${
                            lastTickResults.costBalance >= 0
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                        }`}
                    >
                        {formatNumberWithUnit(lastTickResults.costBalance, 'currency', planetId)}
                    </span>
                </div>
            </div>
            <Separator />
        </Link>
    );
}
