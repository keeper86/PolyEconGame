'use client';

import { MARKET_COLUMNS } from '@/app/planets/[planetId]/agent/[agentId]/market/_components/columnConfig';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit, resourceFormToUnit } from '@/lib/utils';
import { CURRENCY_RESOURCE_PREFIX, currencyMapping } from '@/simulation/market/currencyResources';
import { useParams } from 'next/navigation';
import { useTour } from '@/components/tour/TourContext';
import React from 'react';
import BuySection from './BuySection';
import MarketStepChart from './MarketStepChart';
import ProductPriceHistoryChart from './ProductPriceHistoryChart';
import ResourceTrigger from './ResourceTrigger';
import SellSection from './SellSection';
import { getResourceByName, resourceNameToSlug } from './marketHelpers';
import type { ResourceAccordionItemProps } from './marketTypes';
import { BANDS_FOR_RATIO_CLEARING_PRICE_TO_PRODUCTION_COST } from './marketTypes';

export default function ResourceAccordionItem({
    resourceName,
    agentId,
    assets,
    local,
    onLocalChange,
    isOpen,
    overviewRow,
    visibleColumns,
    allPlanetDeposits,
    ships,
}: ResourceAccordionItemProps): React.ReactElement {
    const bid = assets.market.buy[resourceName];
    const offer = assets.market.sell[resourceName];
    const inventoryQty = resourceName.startsWith(CURRENCY_RESOURCE_PREFIX)
        ? (allPlanetDeposits?.[resourceName.slice(CURRENCY_RESOURCE_PREFIX.length)] ?? 0)
        : (assets.storageFacility.currentInStorage[resourceName]?.quantity ?? 0);
    const trpc = useTRPC();

    const { planetId } = useParams() as { planetId: string };

    const { data: marketData } = useSimulationQuery({
        ...trpc.simulation.getPlanetMarket.queryOptions({ planetId, resourceName }),
        enabled: isOpen,
    });

    const droppedColumns = MARKET_COLUMNS.filter((col) => col.enabled && !visibleColumns.some((v) => v.id === col.id));

    const getPriceCostRatioBand = (
        ratio: number,
    ): (typeof BANDS_FOR_RATIO_CLEARING_PRICE_TO_PRODUCTION_COST)[number] => {
        for (const band of BANDS_FOR_RATIO_CLEARING_PRICE_TO_PRODUCTION_COST) {
            if (ratio <= band.limit) {
                return band;
            }
        }
        return BANDS_FOR_RATIO_CLEARING_PRICE_TO_PRODUCTION_COST[
            BANDS_FOR_RATIO_CLEARING_PRICE_TO_PRODUCTION_COST.length - 1
        ];
    };

    const getDroppedColumnValue = (columnId: string): React.ReactNode => {
        switch (columnId) {
            case 'currentStorage': {
                const resource = getResourceByName(resourceName);
                return formatNumberWithUnit(inventoryQty, resource ? resourceFormToUnit(resource.form) : 'units');
            }
            case 'clearingPrice':
                return formatNumberWithUnit(overviewRow?.clearingPrice, 'currency', planetId);
            case 'totalProduction': {
                const resource = getResourceByName(resourceName);
                return formatNumberWithUnit(
                    overviewRow?.totalProduction,
                    resource ? resourceFormToUnit(resource.form) : 'units',
                );
            }
            case 'totalConsumption': {
                const resource = getResourceByName(resourceName);
                return formatNumberWithUnit(
                    overviewRow?.totalConsumption,
                    resource ? resourceFormToUnit(resource.form) : 'units',
                );
            }
            case 'totalSupply': {
                const resource = getResourceByName(resourceName);
                return formatNumberWithUnit(
                    overviewRow?.totalSupply,
                    resource ? resourceFormToUnit(resource.form) : 'units',
                );
            }
            case 'totalDemand': {
                const resource = getResourceByName(resourceName);
                return formatNumberWithUnit(
                    overviewRow?.totalDemand,
                    resource ? resourceFormToUnit(resource.form) : 'units',
                );
            }
            case 'totalSold': {
                const resource = getResourceByName(resourceName);
                return formatNumberWithUnit(
                    overviewRow?.totalSold,
                    resource ? resourceFormToUnit(resource.form) : 'units',
                );
            }
            case 'priceCostRatio': {
                if (!overviewRow) {
                    return '—';
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
                return '—';
        }
    };

    const issuingPlanetId = resourceName.startsWith('CUR_') ? resourceName.slice(4) : null;
    const displayName = issuingPlanetId ? currencyMapping[issuingPlanetId]?.resource.name : undefined;

    const { isTourActive: marketIsTourActive, markActionCompleted: marketMarkActionCompleted } = useTour();

    const prevOpenRef = React.useRef(isOpen);
    React.useEffect(() => {
        if (isOpen && !prevOpenRef.current && resourceName === 'Construction' && marketIsTourActive) {
            marketMarkActionCompleted('expand-construction-accordion');
        }
        prevOpenRef.current = isOpen;
    }, [isOpen, resourceName, marketIsTourActive, marketMarkActionCompleted]);

    return (
        <AccordionItem value={resourceName} id={resourceNameToSlug(resourceName)}>
            <AccordionTrigger
                className='hover:no-underline px-1'
                {...(resourceName === 'Construction' ? { 'data-tour': 'market-accordion-construction' } : {})}
            >
                <ResourceTrigger
                    name={resourceName}
                    displayName={displayName}
                    bid={bid}
                    offer={offer}
                    overviewRow={overviewRow}
                    storageQuantity={inventoryQty}
                    visibleColumns={visibleColumns}
                    planetId={planetId}
                />
            </AccordionTrigger>
            <AccordionContent>
                <div className='px-1 pb-2 space-y-4'>
                    {droppedColumns.length > 0 && (
                        <div className='flex flex-wrap gap-1.5'>
                            {droppedColumns.map((col) => (
                                <div
                                    key={col.id}
                                    className='flex flex-col gap-0.5 rounded-md bg-muted/40 border border-border/40 px-2 py-1 min-w-[70px] items-end'
                                >
                                    <span className='text-[9px] text-muted-foreground uppercase tracking-wide leading-none'>
                                        {col.label}
                                    </span>
                                    <span className='text-xs font-medium leading-tight'>
                                        {getDroppedColumnValue(col.id)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    <Separator />
                    <div data-tour='market-price-chart'>
                        <ProductPriceHistoryChart
                            planetId={planetId}
                            productName={resourceName}
                            live={
                                marketData?.market
                                    ? {
                                          tick: marketData.tick,
                                          price: marketData.market.clearingPrice,
                                          avgPrice: marketData.market.currentMonthStats?.avgPrice,
                                          minPrice: marketData.market.currentMonthStats?.minPrice,
                                          maxPrice: marketData.market.currentMonthStats?.maxPrice,
                                          priceFloor: marketData.market.currentMonthStats?.priceFloor,
                                      }
                                    : undefined
                            }
                        />
                    </div>

                    <Separator />

                    <div className='flex flex-row flex-wrap gap-8'>
                        <BuySection
                            resourceName={resourceName}
                            agentId={agentId}
                            bid={bid}
                            local={local}
                            assets={assets}
                            overviewRow={overviewRow}
                            onLocalChange={onLocalChange}
                            planetId={planetId}
                            ships={ships}
                        />

                        <SellSection
                            resourceName={resourceName}
                            agentId={agentId}
                            offer={offer}
                            local={local}
                            assets={assets}
                            overviewRow={overviewRow}
                            onLocalChange={onLocalChange}
                            planetId={planetId}
                        />
                    </div>

                    <Separator />
                    <div className='flex flex-col gap-4'>
                        <span className='text-xs font-medium text-muted-foreground'>Daily market clearance chart</span>

                        <MarketStepChart
                            market={marketData?.market ?? undefined}
                            agentId={agentId}
                            planetId={planetId}
                        />
                    </div>
                </div>
            </AccordionContent>
        </AccordionItem>
    );
}
