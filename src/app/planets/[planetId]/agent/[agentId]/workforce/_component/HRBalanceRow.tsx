import { Separator } from '@/components/ui/separator';
import { formatNumberWithUnit } from '@/lib/utils';
import { PRODUCED_QUANTITY } from '@/simulation/planet/specialFacilities';
import Link from 'next/link';

export function HRBalanceRow({
    demand,
    buffer,
    production,
}: {
    demand: number;
    buffer: number;
    production: number;
}): React.ReactElement {
    const scaledBuffer = buffer / demand;
    return (
        <Link href={'' as never}>
            <Separator />
            <div className='py-1 flex flex-row items-center justify-center gap-3 text-[14px] text-muted-foreground bg-muted/80 w-full hover:ring-2 hover:ring-primary/50'>
                <div className='flex flex-col items-center'>
                    {' '}
                    production{' '}
                    <span className='tabular-nums text-green-600 dark:text-green-400'>
                        {formatNumberWithUnit(production / demand, 'days')}
                    </span>
                </div>

                <span className='shrink-0'>−</span>
                <div className='flex flex-col items-center'>
                    {' '}
                    demand{' '}
                    <span className='tabular-nums text-red-600 dark:text-red-400'>
                        {formatNumberWithUnit(1, 'days')}
                    </span>
                </div>

                <span className='shrink-0'>{' → '}</span>

                <div className='flex flex-col items-center text-foreground'>
                    {' '}
                    buffer{' '}
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
                        {formatNumberWithUnit(scaledBuffer, 'days')}
                    </span>
                </div>
            </div>
            <Separator />
        </Link>
    );
}

export function HRBuildRow({ scale }: { scale: number }): React.ReactElement {
    return (
        <Link href={'' as never}>
            <Separator />
            <div className='py-1 flex flex-row items-center justify-center gap-3 text-[14px] text-muted-foreground bg-muted/80 w-full h-12'>
                <div className='flex flex-row items-center gap-1'>
                    {' '}
                    Can manage up to{' '}
                    <span className='tabular-nums text-green-600 dark:text-green-400'>
                        {formatNumberWithUnit(scale * PRODUCED_QUANTITY, 'persons')}
                    </span>{' '}
                    workers.
                </div>
            </div>
            <Separator />
        </Link>
    );
}
