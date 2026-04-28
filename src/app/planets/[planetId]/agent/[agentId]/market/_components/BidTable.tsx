'use client';

import React from 'react';
import { cn, formatNumberWithUnit } from '@/lib/utils';

export type BidRow = {
    agentId: string;
    agentName: string;
    bidPrice: number;
    demandedQuantity: number;
    lastBought: number;
    fillRatio: number;
    lastSpent: number;
};

type Props = {
    bids: BidRow[];
};

function fillRatioClass(fr: number): string {
    if (fr >= 0.99) {
        return 'text-green-600 dark:text-green-400';
    }
    if (fr >= 0.01) {
        return 'text-amber-600 dark:text-amber-400';
    }
    return 'text-muted-foreground';
}

export default function BidTable({ bids }: Props): React.ReactElement {
    if (bids.length === 0) {
        return <p className='text-xs text-muted-foreground py-2'>No agent buyers this tick.</p>;
    }

    return (
        <div className='overflow-x-auto'>
            <table className='w-full text-xs'>
                <thead>
                    <tr className='border-b text-muted-foreground'>
                        <th className='text-left py-1 pr-2 font-medium'>#</th>
                        <th className='text-left py-1 pr-2 font-medium'>Agent</th>
                        <th className='text-right py-1 pr-2 font-medium'>Bid (¤/t)</th>
                        <th className='text-right py-1 pr-2 font-medium'>Demanded (t)</th>
                        <th className='text-right py-1 pr-2 font-medium'>Bought (t)</th>
                        <th className='text-right py-1 pr-2 font-medium'>Fill %</th>
                        <th className='text-right py-1 font-medium'>Spent</th>
                    </tr>
                </thead>
                <tbody>
                    {bids.map((row, i) => (
                        <tr key={row.agentId} className='border-b last:border-0'>
                            <td className='py-1 pr-2 text-muted-foreground tabular-nums'>{i + 1}</td>
                            <td className='py-1 pr-2 font-medium truncate max-w-[120px]'>{row.agentName}</td>
                            <td className='py-1 pr-2 text-right tabular-nums font-mono'>
                                {formatNumberWithUnit(row.bidPrice, 'currency')}
                            </td>
                            <td className='py-1 pr-2 text-right tabular-nums'>
                                {formatNumberWithUnit(row.demandedQuantity, 'tonnes')}
                            </td>
                            <td className='py-1 pr-2 text-right tabular-nums'>
                                {formatNumberWithUnit(row.lastBought, 'tonnes')}
                            </td>
                            <td className={cn('py-1 pr-2 text-right tabular-nums', fillRatioClass(row.fillRatio))}>
                                {(row.fillRatio * 100).toFixed(0)}%
                            </td>
                            <td className='py-1 text-right tabular-nums font-mono'>
                                {formatNumberWithUnit(row.lastSpent, 'currency')}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
