'use client';

import { formatNumberWithUnit } from '@/lib/utils';
import type { FlowRates } from './resourceFlowNormalizer';

function paceBadge(label: string, pct: number): React.ReactElement {
    const abs = Math.abs(pct);
    if (abs < 5) {
        return (
            <span className='inline-flex items-center gap-0.5 text-[10px] text-muted-foreground'>
                <span className='text-[9px]'>→</span>
                {label}: {'<'}5%
            </span>
        );
    }
    const dir = pct > 0 ? '↑' : '↓';
    const cls = pct > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';
    return (
        <span className={`inline-flex items-center gap-0.5 text-[10px] ${cls}`}>
            <span className='text-[9px]'>{dir}</span>
            {label}: {abs.toFixed(0)}%
        </span>
    );
}

function MicroBulletChart({ rates }: { rates: FlowRates }): React.ReactElement {
    const max = Math.max(rates.prevMonthAvgRate, rates.currentMonthAvgRate, rates.lastTickRate, 0.001);
    const prevPct = (rates.prevMonthAvgRate / max) * 100;
    const currPct = (rates.currentMonthAvgRate / max) * 100;
    const lastPct = (rates.lastTickRate / max) * 100;

    return (
        <div className='space-y-0.5 mt-1'>
            <div className='relative h-2 w-full bg-muted-foreground/10 rounded-sm overflow-hidden'>
                <div
                    className='absolute inset-y-0 left-0 bg-muted-foreground/20 rounded-sm'
                    style={{ width: `${prevPct}%` }}
                />
                <div className='absolute inset-y-0 left-0 bg-primary/30 rounded-sm' style={{ width: `${currPct}%` }} />
                <div
                    className='absolute top-0 bottom-0 w-0.5 bg-foreground rounded-sm'
                    style={{ left: `${lastPct}%` }}
                />
            </div>
            <div className='flex justify-between text-[9px] text-muted-foreground/60'>
                <span>Prev Mo</span>
                <span>MTD</span>
                <span>Last</span>
            </div>
        </div>
    );
}

export function ResourceFlowTooltip({ rates }: { rates: FlowRates }): React.ReactElement {
    const vsMtdPct =
        rates.currentMonthAvgRate > 0
            ? ((rates.lastTickRate - rates.currentMonthAvgRate) / rates.currentMonthAvgRate) * 100
            : rates.lastTickRate > 0
              ? 100
              : 0;
    const vsPrevPct =
        rates.prevMonthAvgRate > 0
            ? ((rates.currentMonthAvgRate - rates.prevMonthAvgRate) / rates.prevMonthAvgRate) * 100
            : rates.currentMonthAvgRate > 0
              ? 100
              : 0;

    return (
        <div className='space-y-2 min-w-[160px]'>
            <div className='space-y-1 text-[11px]'>
                <div className='flex justify-between'>
                    <span className='text-muted-foreground'>Previous Month</span>
                    <span className='font-medium tabular-nums'>
                        {formatNumberWithUnit(rates.prevMonthAvgRate, 'none')} u/t
                    </span>
                </div>
                <div className='flex justify-between'>
                    <span className='text-muted-foreground'>Current Month</span>
                    <span className='font-medium tabular-nums'>
                        {formatNumberWithUnit(rates.currentMonthAvgRate, 'none')} u/t
                    </span>
                </div>
                <div className='flex justify-between border-t border-border/20 pt-1'>
                    <span className='font-medium'>Last Tick</span>
                    <span className='font-bold tabular-nums'>
                        {formatNumberWithUnit(rates.lastTickRate, 'none')} u/t
                    </span>
                </div>
            </div>

            <MicroBulletChart rates={rates} />

            <div className='flex flex-wrap gap-x-2 gap-y-0.5 pt-1 border-t border-border/20'>
                {paceBadge('vs MTD', vsMtdPct)}
                {paceBadge('vs Prev. Mo', vsPrevPct)}
            </div>
        </div>
    );
}
