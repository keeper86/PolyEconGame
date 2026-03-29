'use client';

/**
 * OfferTable
 *
 * Displays per-agent food market offers in merit order (cheapest first).
 * Highlights the marginal seller — the last agent whose offer was
 * (at least partially) needed to fill aggregate demand.
 *
 * Columns:
 *   Agent | Offer price | Offered (t) | Sold (t) | Sell-through | Revenue
 */

import React from 'react';
import { cn, formatNumbers } from '@/lib/utils';

export type OfferRow = {
    agentId: string;
    agentName: string;
    offerPrice: number;
    lastPlacedQuantity: number;
    lastSold: number;
    sellThrough: number;
    lastRevenue: number;
};

type Props = {
    offers: OfferRow[];
    /** VWAP clearing price — used to identify the marginal seller. */
    clearingPrice: number;
};

function sellThroughClass(st: number): string {
    if (st >= 0.99) {
        return 'text-green-600 dark:text-green-400';
    }
    if (st >= 0.01) {
        return 'text-amber-600 dark:text-amber-400';
    }
    return 'text-muted-foreground';
}

export default function OfferTable({ offers, clearingPrice }: Props): React.ReactElement {
    if (offers.length === 0) {
        return <p className='text-xs text-muted-foreground py-2'>No food sellers this tick.</p>;
    }

    // The marginal agent is the one whose offer price is closest to the
    // clearing price from below (last infra-marginal or first supra-marginal).
    const marginalIdx = (() => {
        let best = -1;
        let bestDiff = Infinity;
        for (let i = 0; i < offers.length; i++) {
            const diff = Math.abs(offers[i].offerPrice - clearingPrice);
            if (diff < bestDiff) {
                bestDiff = diff;
                best = i;
            }
        }
        return best;
    })();

    return (
        <div className='overflow-x-auto'>
            <table className='w-full text-xs'>
                <thead>
                    <tr className='border-b text-muted-foreground'>
                        <th className='text-left py-1 pr-2 font-medium'>#</th>
                        <th className='text-left py-1 pr-2 font-medium'>Agent</th>
                        <th className='text-right py-1 pr-2 font-medium'>Price (¤/t)</th>
                        <th className='text-right py-1 pr-2 font-medium'>Offered (t)</th>
                        <th className='text-right py-1 pr-2 font-medium'>Sold (t)</th>
                        <th className='text-right py-1 pr-2 font-medium'>Fill %</th>
                        <th className='text-right py-1 font-medium'>Revenue</th>
                    </tr>
                </thead>
                <tbody>
                    {offers.map((row, i) => {
                        const isMarginal = i === marginalIdx && row.sellThrough > 0 && row.sellThrough < 0.999;
                        return (
                            <tr
                                key={row.agentId}
                                className={cn(
                                    'border-b last:border-0',
                                    isMarginal && 'bg-amber-50 dark:bg-amber-950/30',
                                )}
                            >
                                <td className='py-1 pr-2 text-muted-foreground tabular-nums'>{i + 1}</td>
                                <td className='py-1 pr-2 font-medium truncate max-w-[120px]'>
                                    {row.agentName}
                                    {isMarginal && (
                                        <span className='ml-1 text-[9px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide'>
                                            marginal
                                        </span>
                                    )}
                                </td>
                                <td className='py-1 pr-2 text-right tabular-nums font-mono'>
                                    {formatNumbers(row.offerPrice)}
                                </td>
                                <td className='py-1 pr-2 text-right tabular-nums'>
                                    {formatNumbers(row.lastPlacedQuantity)}
                                </td>
                                <td className='py-1 pr-2 text-right tabular-nums'>{formatNumbers(row.lastSold)}</td>
                                <td
                                    className={cn(
                                        'py-1 pr-2 text-right tabular-nums',
                                        sellThroughClass(row.sellThrough),
                                    )}
                                >
                                    {formatNumbers(row.sellThrough * 100)}%
                                </td>
                                <td className='py-1 text-right tabular-nums'>{formatNumbers(row.lastRevenue)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
