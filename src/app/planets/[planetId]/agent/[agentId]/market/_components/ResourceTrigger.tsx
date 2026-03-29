import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Bot } from 'lucide-react';
import { cn, formatNumbers } from '@/lib/utils';
import { ProductIcon } from '@/components/client/ProductIcon';
import type { ResourceTriggerProps } from './marketTypes';
import { classifyMarket } from './marketHelpers';
import { MARKET_STATUS_CONFIG } from './marketTypes';
import { getEnabledColumns, getColumnClasses } from '../../../_component/columnConfig';

export default function ResourceTrigger({ name, bid, offer, overviewRow }: ResourceTriggerProps): React.ReactElement {
    const marketStatus = overviewRow ? classifyMarket(overviewRow) : undefined;
    const statusConfig = marketStatus ? MARKET_STATUS_CONFIG[marketStatus] : undefined;
    const hasActiveBid = bid?.bidPrice !== undefined || bid?.bidStorageTarget !== undefined;
    const hasActiveOffer = offer?.offerPrice !== undefined || offer?.offerRetainment !== undefined;
    const columns = getEnabledColumns();

    // Helper to get value for a column
    const getColumnValue = (columnId: string) => {
        if (!overviewRow) {
            return null;
        }

        switch (columnId) {
            case 'clearingPrice':
                return formatNumbers(overviewRow.clearingPrice);
            case 'totalProduction':
                return formatNumbers(overviewRow.totalProduction);
            case 'totalSupply':
                return formatNumbers(overviewRow.totalSupply);
            case 'totalDemand':
                return formatNumbers(overviewRow.totalDemand);
            case 'totalSold':
                return formatNumbers(overviewRow.totalSold);
            case 'marketFill':
                return statusConfig ? (
                    <Badge variant='outline' className={cn('text-[9px] px-1.5 py-0 h-5', statusConfig.className)}>
                        {statusConfig.label}
                    </Badge>
                ) : null;
            default:
                return null;
        }
    };

    // Helper to get text color class based on value
    const getTextColorClass = (columnId: string, value: number) => {
        if (value === 0) {
            return 'text-muted-foreground/30';
        }

        switch (columnId) {
            case 'clearingPrice':
                return 'text-foreground font-semibold';
            case 'totalProduction':
            case 'totalSupply':
            case 'totalDemand':
            case 'totalSold':
                return 'text-muted-foreground';
            default:
                return '';
        }
    };

    return (
        <div className='flex flex-1 items-center gap-2 min-w-0'>
            {/* Icon */}
            <ProductIcon productName={name} size={24} />

            {/* Name + market link + order indicators */}
            <div className='flex-1 min-w-0 flex items-center gap-1'>
                <span className='text-sm font-medium truncate'>{name}</span>
                {(hasActiveBid || hasActiveOffer || bid?.automated || offer?.automated || bid?.storageFullWarning) && (
                    <div className='flex items-center gap-0.5 ml-0.5 shrink-0'>
                        {hasActiveBid && (
                            <span
                                className='h-1.5 w-1.5 rounded-full bg-blue-500'
                                title={bid?.automated ? 'Auto buy' : 'Active buy bid'}
                            />
                        )}
                        {hasActiveOffer && (
                            <span
                                className='h-1.5 w-1.5 rounded-full bg-green-500'
                                title={offer?.automated ? 'Auto sell' : 'Active sell offer'}
                            />
                        )}
                        {(bid?.automated || offer?.automated) && <Bot className='h-3 w-3 text-purple-500' />}
                        {bid?.storageFullWarning && (
                            <Badge variant='destructive' className='text-[9px] px-1 py-0 h-3.5'>
                                full
                            </Badge>
                        )}
                    </div>
                )}
            </div>

            {/* ── Market stats — using column configuration ── */}
            {overviewRow ? (
                <>
                    {columns.map((column) => {
                        const value = getColumnValue(column.id);
                        const isMarketFillColumn = column.id === 'marketFill';
                        const numericValue = overviewRow[column.id as keyof typeof overviewRow] as number;

                        return isMarketFillColumn ? (
                            <div
                                key={column.id}
                                className={cn(getColumnClasses(column.id), 'flex justify-end')}
                                title={column.title}
                            >
                                {value}
                            </div>
                        ) : (
                            <span
                                key={column.id}
                                className={cn(
                                    getColumnClasses(column.id),
                                    'text-[11px] tabular-nums',
                                    getTextColorClass(column.id, numericValue),
                                )}
                                title={column.title}
                            >
                                {value}
                            </span>
                        );
                    })}
                </>
            ) : (
                /* No overview data yet — preserve column widths so rows don't shift */
                <>
                    {columns.map((column) =>
                        column.id === 'marketFill' ? (
                            <div key={column.id} className={cn(getColumnClasses(column.id), 'flex justify-end')}>
                                <span className='text-[10px] text-muted-foreground/30 italic'>—</span>
                            </div>
                        ) : (
                            <div key={column.id} className={getColumnClasses(column.id)} />
                        ),
                    )}
                </>
            )}
        </div>
    );
}
