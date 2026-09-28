'use client';

import { Separator } from '@/components/ui/separator';
import { formatNumberWithUnit } from '@/lib/utils';
import { PRODUCED_HR_QUANTITY } from '@/simulation/planet/specialFacilities';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

export function HRBalanceRow({
    demand,
    buffer,
    production,
    children,
}: {
    demand: number;
    buffer: number;
    production: number;
    children?: React.ReactNode;
}): React.ReactElement {
    const locale = useLocale();
    const tr = useTranslations('Workforce');
    if (demand === 0) {
        return (
            <Link href={'' as never}>
                <Separator />
                <span className='flex flex-col bg-muted/80 w-full hover:ring-2 hover:ring-primary/50'>
                    <div className='py-1 flex flex-row items-center justify-center gap-3 text-[14px] text-muted-foreground'>
                        <div className='flex flex-col items-center'>
                            {' '}
                            {tr('productionLabel')}{' '}
                            <span className='tabular-nums text-muted-foreground'>
                                {production} {tr('workers')}
                            </span>
                        </div>

                        <span className='shrink-0'>−</span>
                        <div className='flex flex-col items-center'>
                            {' '}
                            {tr('demandLabel')} <span className='tabular-nums text-muted-foreground'>-</span>
                        </div>

                        <span className='shrink-0'>{' → '}</span>

                        <div className='flex flex-col items-center text-foreground'>
                            {' '}
                            {tr('bufferLabel')}{' '}
                            <span className='tabular-nums text-md text-muted-foreground'>
                                {buffer} {tr('workerDays')}
                            </span>
                        </div>
                    </div>
                    {children}
                </span>
                <Separator />
            </Link>
        );
    }

    const scaledBuffer = buffer / demand;
    return (
        <Link href={'' as never}>
            <Separator />
            <span className='flex flex-col bg-muted/80 w-full hover:ring-2 hover:ring-primary/50'>
                <div className='py-1 flex flex-row items-center justify-center gap-3 text-[14px] text-muted-foreground'>
                    <div className='flex flex-col items-center'>
                        {' '}
                        {tr('productionLabel')}{' '}
                        <span className='tabular-nums text-green-600 dark:text-green-400'>
                            {formatNumberWithUnit(production / demand, 'days', undefined, locale)}
                        </span>
                    </div>

                    <span className='shrink-0'>−</span>
                    <div className='flex flex-col items-center'>
                        {' '}
                        {tr('demandLabel')}{' '}
                        <span className='tabular-nums text-red-600 dark:text-red-400'>
                            {formatNumberWithUnit(1, 'days', undefined, locale)}
                        </span>
                    </div>

                    <span className='shrink-0'>{' → '}</span>

                    <div className='flex flex-col items-center text-foreground'>
                        {' '}
                        {tr('bufferLabel')}{' '}
                        <span
                            className={`tabular-nums text-md ${
                                scaledBuffer >= 4
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : scaledBuffer >= 2
                                      ? 'text-green-600 dark:text-green-400'
                                      : scaledBuffer >= 1
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-red-600 dark:text-red-400'
                            }`}
                        >
                            {formatNumberWithUnit(scaledBuffer, 'days', undefined, locale)}
                        </span>
                    </div>
                </div>
                {children && <Separator />}
                {children}
            </span>
            <Separator />
        </Link>
    );
}

export function HRBuildRow({ scale }: { scale: number }): React.ReactElement {
    const locale = useLocale();
    const tr = useTranslations('Workforce');
    return (
        <Link href={'' as never}>
            <Separator />
            <div className='py-1 flex flex-row items-center justify-center gap-3 text-[14px] text-muted-foreground bg-muted/80 w-full h-12'>
                <div className='flex flex-row items-center gap-1'>
                    {' '}
                    {tr('canManageUpTo', {
                        count: formatNumberWithUnit(scale * PRODUCED_HR_QUANTITY, 'persons', undefined, locale),
                    })}
                </div>
            </div>
            <Separator />
        </Link>
    );
}
