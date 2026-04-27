import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Bot } from 'lucide-react';
import { cn, formatNumbers, formatNumberWithUnit } from '@/lib/utils';
import { ProductIcon } from '@/components/client/ProductIcon';
import type { ResourceTriggerProps } from './marketTypes';
import { classifyMarket } from './marketHelpers';
import { MARKET_STATUS_CONFIG } from './marketTypes';
import { getColumnClasses } from './columnConfig';

export default function ResourceTrigger({
    name,
    displayName,
    bid,
    offer,
    overviewRow,
    storageQuantity,
    visibleColumns,
    planetId,
}: ResourceTriggerProps): React.ReactElement {
    const marketStatus = overviewRow ? classifyMarket(overviewRow) : undefined;
    const statusConfig = marketStatus ? MARKET_STATUS_CONFIG[marketStatus] : undefined;
    const hasActiveBid = bid?.bidPrice !== undefined || bid?.bidStorageTarget !== undefined;
    const hasActiveOffer = offer?.offerPrice !== undefined || offer?.offerRetainment !== undefined;

    // Helper to get value for a column
    const getColumnValue = (columnId: string) => {
        switch (columnId) {
            case 'currentStorage':
                return storageQuantity !== undefined ? formatNumbers(storageQuantity) : null;
            case 'clearingPrice':
                return overviewRow ? formatNumberWithUnit(overviewRow.clearingPrice, 'currency', planetId) : null;
            case 'totalProduction':
                return overviewRow ? formatNumbers(overviewRow.totalProduction) : null;
            case 'totalConsumption':
                return overviewRow ? formatNumbers(overviewRow.totalConsumption) : null;
            case 'totalSupply':
                return overviewRow ? formatNumbers(overviewRow.totalSupply) : null;
            case 'totalDemand':
                return overviewRow ? formatNumbers(overviewRow.totalDemand) : null;
            case 'totalSold':
                return overviewRow ? formatNumbers(overviewRow.totalSold) : null;
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
            case 'currentStorage':
                return 'text-foreground font-medium';
            case 'clearingPrice':
                return 'text-foreground font-semibold';
            case 'totalProduction':
            case 'totalConsumption':
            case 'totalSupply':
            case 'totalDemand':
            case 'totalSold':
                return 'text-muted-foreground';
            default:
                return '';
        }
    };

    // Get numeric value for a column
    const getNumericValue = (columnId: string): number => {
        switch (columnId) {
            case 'currentStorage':
                return storageQuantity ?? 0;
            case 'clearingPrice':
                return overviewRow?.clearingPrice ?? 0;
            case 'totalProduction':
                return overviewRow?.totalProduction ?? 0;
            case 'totalConsumption':
                return overviewRow?.totalConsumption ?? 0;
            case 'totalSupply':
                return overviewRow?.totalSupply ?? 0;
            case 'totalDemand':
                return overviewRow?.totalDemand ?? 0;
            case 'totalSold':
                return overviewRow?.totalSold ?? 0;
            default:
                return 0;
        }
    };

    return (
        <div className='flex flex-1 items-center gap-2 min-w-0 overflow-hidden'>
            {/* Icon */}
            <ProductIcon productName={name} label={displayName ?? name} />

            {/* Name + market link + order indicators */}
            <div className={cn('flex-1 min-w-0 flex items-center gap-1')}>
                <span className='text-sm font-medium truncate'>{displayName ?? name}</span>
                {(hasActiveBid ||
                    hasActiveOffer ||
                    bid?.automated ||
                    offer?.automated ||
                    bid?.storageFullWarning ||
                    bid?.storageScaleWarning) && (
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
                        {bid?.storageScaleWarning && (
                            <Badge
                                variant='outline'
                                className='text-[9px] px-1 py-0 h-3.5 bg-amber-500 text-amber-950 border-amber-600'
                            >
                                {bid.storageScaleWarning === 'scaled' ? 'storage' : 'no space'}
                            </Badge>
                        )}
                        {bid?.depositScaleWarning && (
                            <Badge
                                variant='outline'
                                className='text-[9px] px-1 py-0 h-3.5 bg-amber-500 text-amber-950 border-amber-600'
                            >
                                {bid.depositScaleWarning === 'scaled' ? 'deposit' : 'no funds'}
                            </Badge>
                        )}
                    </div>
                )}
            </div>

            {/* ── Market stats — using dynamic column configuration ── */}
            {visibleColumns.map((column) => {
                const value = getColumnValue(column.id);
                const isMarketFillColumn = column.id === 'marketFill';
                const numericValue = getNumericValue(column.id);

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
                        {value || (overviewRow ? '—' : '')}
                    </span>
                );
            })}
        </div>
    );
}
