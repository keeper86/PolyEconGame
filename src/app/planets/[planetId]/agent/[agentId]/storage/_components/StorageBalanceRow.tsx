import { Separator } from '@/components/ui/separator';
import { formatNumberWithUnit } from '@/lib/utils';
import { PRODUCED_STORAGE_QUANTITY } from '@/simulation/planet/specialFacilities';
import Link from 'next/link';

export function StorageBalanceRow({
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
    if (demand === 0) {
        return (
            <Link href={'' as never}>
                <Separator />
                <span className='flex flex-col bg-muted/80 w-full hover:ring-2 hover:ring-primary/50'>
                    <div className='py-1 flex flex-row items-center justify-center gap-3 text-[14px] text-muted-foreground'>
                        <div className='flex flex-col items-center'>
                            {' '}
                            production{' '}
                            <span className='tabular-nums text-muted-foreground'>
                                {formatNumberWithUnit(production, 'tonnes')}
                            </span>
                        </div>

                        <span className='shrink-0'>−</span>
                        <div className='flex flex-col items-center'>
                            {' '}
                            demand <span className='tabular-nums text-muted-foreground'>-</span>
                        </div>

                        <span className='shrink-0'>{' → '}</span>

                        <div className='flex flex-col items-center text-foreground'>
                            {' '}
                            buffer{' '}
                            <span className='tabular-nums text-md text-muted-foreground'>
                                {formatNumberWithUnit(buffer, 'tonnes')}
                            </span>
                        </div>
                    </div>
                    {children}
                </span>
                <Separator />
            </Link>
        );
    }

    const bufferRatio = buffer / demand;
    return (
        <Link href={'' as never}>
            <Separator />
            <span className='flex flex-col bg-muted/80 w-full hover:ring-2 hover:ring-primary/50'>
                <div className='py-1 flex flex-row items-center justify-center gap-3 text-[14px] text-muted-foreground'>
                    <div className='flex flex-col items-center'>
                        {' '}
                        production{' '}
                        <span className='tabular-nums text-green-600 dark:text-green-400'>
                            {formatNumberWithUnit(production, 'tonnes')}
                        </span>
                    </div>

                    <span className='shrink-0'>−</span>
                    <div className='flex flex-col items-center'>
                        {' '}
                        demand{' '}
                        <span className='tabular-nums text-red-600 dark:text-red-400'>
                            {formatNumberWithUnit(demand, 'tonnes')}
                        </span>
                    </div>

                    <span className='shrink-0'>{' → '}</span>

                    <div className='flex flex-col items-center text-foreground'>
                        {' '}
                        buffer{' '}
                        <span
                            className={`tabular-nums text-md ${
                                bufferRatio >= 4
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : bufferRatio >= 2
                                      ? 'text-green-600 dark:text-green-400'
                                      : bufferRatio >= 1
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-red-600 dark:text-red-400'
                            }`}
                        >
                            {formatNumberWithUnit(buffer, 'tonnes')}
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

export function StorageBuildRow({ scale }: { scale: number }): React.ReactElement {
    return (
        <Link href={'' as never}>
            <Separator />
            <div className='py-1 flex flex-row items-center justify-center gap-3 text-[14px] text-muted-foreground bg-muted/80 w-full h-12'>
                <div className='flex flex-row items-center gap-1'>
                    {' '}
                    Can transport up to{' '}
                    <span className='tabular-nums text-green-600 dark:text-green-400'>
                        {formatNumberWithUnit(scale * PRODUCED_STORAGE_QUANTITY, 'tonnes')}
                    </span>{' '}
                    per tick.
                </div>
            </div>
            <Separator />
        </Link>
    );
}
