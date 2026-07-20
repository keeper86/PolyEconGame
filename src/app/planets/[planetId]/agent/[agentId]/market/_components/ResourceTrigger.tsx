import { ProductIcon } from '@/components/client/ProductIcon';
import { Badge } from '@/components/ui/badge';
import { cn, formatNumberWithUnit, resourceFormToUnit } from '@/lib/utils';
import { CURRENCY_RESOURCE_PREFIX } from '@/simulation/market/currencyResources';
import React from 'react';
import { getColumnClasses } from './columnConfig';
import { getResourceByName } from './marketHelpers';
import type { ResourceTriggerProps } from './marketTypes';
import { BANDS_FOR_RATIO_CLEARING_PRICE_TO_PRODUCTION_COST } from './marketTypes';

function getPriceCostRatioBand(ratio: number): (typeof BANDS_FOR_RATIO_CLEARING_PRICE_TO_PRODUCTION_COST)[number] {
    for (const band of BANDS_FOR_RATIO_CLEARING_PRICE_TO_PRODUCTION_COST) {
        if (ratio <= band.limit) {
            return band;
        }
    }
    return BANDS_FOR_RATIO_CLEARING_PRICE_TO_PRODUCTION_COST[
        BANDS_FOR_RATIO_CLEARING_PRICE_TO_PRODUCTION_COST.length - 1
    ];
}

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
    const hasActiveBid = bid?.bidPrice !== undefined || bid?.bidStorageTarget !== undefined;
    const hasActiveOffer = offer?.offerPrice !== undefined || offer?.offerRetainment !== undefined;

    const getColumnValue = (columnId: string) => {
        const resource = getResourceByName(name);
        const qtyUnit = resource ? resourceFormToUnit(resource.form) : 'units';
        switch (columnId) {
            case 'currentStorage':
                return storageQuantity !== undefined ? formatNumberWithUnit(storageQuantity, qtyUnit) : null;
            case 'clearingPrice':
                return overviewRow ? formatNumberWithUnit(overviewRow.clearingPrice, 'currency', planetId) : null;
            case 'totalProduction':
                if (name.startsWith(CURRENCY_RESOURCE_PREFIX)) {
                    return null;
                }
                return overviewRow ? formatNumberWithUnit(overviewRow.totalProduction, qtyUnit) : null;
            case 'totalConsumption':
                if (name.startsWith(CURRENCY_RESOURCE_PREFIX)) {
                    return null;
                }
                return overviewRow ? formatNumberWithUnit(overviewRow.totalConsumption, qtyUnit) : null;
            case 'totalSupply':
                return overviewRow ? formatNumberWithUnit(overviewRow.totalSupply, qtyUnit) : null;
            case 'totalDemand':
                return overviewRow ? formatNumberWithUnit(overviewRow.totalDemand, qtyUnit) : null;
            case 'totalSold':
                return overviewRow ? formatNumberWithUnit(overviewRow.totalSold, qtyUnit) : null;
            case 'priceCostRatio': {
                if (!overviewRow) {
                    return null;
                }
                const ratio = overviewRow.priceCostRatio;
                const band = getPriceCostRatioBand(ratio);
                return (
                    <Badge variant='outline' className={`text-[9px] px-1.5 py-0 h-5 ${band.className}`}>
                        {band.label}
                    </Badge>
                );
            }
            default:
                return null;
        }
    };

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
            case 'priceCostRatio':
                return overviewRow?.priceCostRatio ?? 0;
            default:
                return 0;
        }
    };

    return (
        <div className='flex flex-1 items-center gap-2 min-w-0 overflow-hidden'>
            <ProductIcon productName={name} label={displayName ?? name} />

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
                                title={bid?.automated ? 'Buying' : 'Active buy bid'}
                            />
                        )}
                        {hasActiveOffer && (
                            <span
                                className='h-1.5 w-1.5 rounded-full bg-green-500'
                                title={offer?.automated ? 'Selling' : 'Active sell offer'}
                            />
                        )}
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

            {visibleColumns.map((column) => {
                const value = getColumnValue(column.id);
                const isPriceCostRatioColumn = column.id === 'priceCostRatio';
                const numericValue = getNumericValue(column.id);

                return isPriceCostRatioColumn ? (
                    <div
                        key={column.id}
                        className={cn(getColumnClasses(column.id), 'flex justify-end')}
                        title={column.title + ' ' + overviewRow?.priceCostRatio.toFixed(2)}
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
