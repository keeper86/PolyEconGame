'use client';

import { MARKET_COLUMNS } from '@/app/planets/[planetId]/agent/[agentId]/market/_components/columnConfig';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit, resourceFormToUnit } from '@/lib/utils';
import { PRICE_FLOOR } from '@/simulation/constants';
import { CURRENCY_RESOURCE_PREFIX, currencyMapping } from '@/simulation/market/currencyResources';
import { validateBuyBid, validateSellOffer } from '@/simulation/market/validation';
import { useMutation } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import BuySection from './BuySection';
import MarketStepChart from './MarketStepChart';
import ProductPriceHistoryChart from './ProductPriceHistoryChart';
import ResourceTrigger from './ResourceTrigger';
import SellSection from './SellSection';
import { getResourceByName, resourceNameToSlug } from './marketHelpers';
import type { ResourceAccordionItemProps } from './marketTypes';
import {
    autoConfigToLocal,
    BANDS_FOR_RATIO_CLEARING_PRICE_TO_PRODUCTION_COST,
    localToAutoConfig,
    TTL_FEEDBACK,
} from './marketTypes';

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

    const [buySuccessMsg, setBuySuccessMsg] = useState<string | null>(null);
    const [buyErrorMsg, setBuyErrorMsg] = useState<string | null>(null);
    const [sellSuccessMsg, setSellSuccessMsg] = useState<string | null>(null);
    const [sellErrorMsg, setSellErrorMsg] = useState<string | null>(null);
    const [buyAutoConfigSuccessMsg, setBuyAutoConfigSuccessMsg] = useState<string | null>(null);
    const [buyAutoConfigErrorMsg, setBuyAutoConfigErrorMsg] = useState<string | null>(null);
    const [sellAutoConfigSuccessMsg, setSellAutoConfigSuccessMsg] = useState<string | null>(null);
    const [sellAutoConfigErrorMsg, setSellAutoConfigErrorMsg] = useState<string | null>(null);

    const buySuccessTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const buyErrorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const sellSuccessTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const sellErrorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const resource = getResourceByName(resourceName);

    const issuingPlanetId = resourceName.startsWith('CUR_') ? resourceName.slice(4) : null;
    const displayName = issuingPlanetId ? currencyMapping[issuingPlanetId]?.resource.name : undefined;

    useEffect(() => {
        return () => {
            if (buySuccessTimeoutRef.current) {
                clearTimeout(buySuccessTimeoutRef.current);
            }
            if (buyErrorTimeoutRef.current) {
                clearTimeout(buyErrorTimeoutRef.current);
            }
            if (sellSuccessTimeoutRef.current) {
                clearTimeout(sellSuccessTimeoutRef.current);
            }
            if (sellErrorTimeoutRef.current) {
                clearTimeout(sellErrorTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (buySuccessMsg) {
            if (buySuccessTimeoutRef.current) {
                clearTimeout(buySuccessTimeoutRef.current);
            }
            buySuccessTimeoutRef.current = setTimeout(() => {
                setBuySuccessMsg(null);
            }, TTL_FEEDBACK);
        }
        return () => {
            if (buySuccessTimeoutRef.current) {
                clearTimeout(buySuccessTimeoutRef.current);
            }
        };
    }, [buySuccessMsg]);

    useEffect(() => {
        if (buyErrorMsg) {
            if (buyErrorTimeoutRef.current) {
                clearTimeout(buyErrorTimeoutRef.current);
            }
            buyErrorTimeoutRef.current = setTimeout(() => {
                setBuyErrorMsg(null);
            }, TTL_FEEDBACK);
        }
        return () => {
            if (buyErrorTimeoutRef.current) {
                clearTimeout(buyErrorTimeoutRef.current);
            }
        };
    }, [buyErrorMsg]);

    useEffect(() => {
        if (sellSuccessMsg) {
            if (sellSuccessTimeoutRef.current) {
                clearTimeout(sellSuccessTimeoutRef.current);
            }
            sellSuccessTimeoutRef.current = setTimeout(() => {
                setSellSuccessMsg(null);
            }, TTL_FEEDBACK);
        }
        return () => {
            if (sellSuccessTimeoutRef.current) {
                clearTimeout(sellSuccessTimeoutRef.current);
            }
        };
    }, [sellSuccessMsg]);

    useEffect(() => {
        if (sellErrorMsg) {
            if (sellErrorTimeoutRef.current) {
                clearTimeout(sellErrorTimeoutRef.current);
            }
            sellErrorTimeoutRef.current = setTimeout(() => {
                setSellErrorMsg(null);
            }, TTL_FEEDBACK);
        }
        return () => {
            if (sellErrorTimeoutRef.current) {
                clearTimeout(sellErrorTimeoutRef.current);
            }
        };
    }, [sellErrorMsg]);

    useEffect(() => {
        if (!resource) {
            return;
        }

        const validationErrors: typeof local.validationErrors = {};

        if (local.offerPrice !== '') {
            const offerPrice = parseFloat(local.offerPrice);
            if (!isNaN(offerPrice)) {
                const validation = validateSellOffer(offerPrice, inventoryQty);
                if (!validation.isValid) {
                    validationErrors.offerPrice = validation.error;
                }
            }
        }

        if (local.offerRetainment !== '') {
            const offerRetainment = parseFloat(local.offerRetainment);
            if (!isNaN(offerRetainment) && offerRetainment < 0) {
                validationErrors.offerRetainment = 'Retainment must be non-negative';
            }
        }

        if (local.bidPrice !== '') {
            const bidPrice = parseFloat(local.bidPrice);
            if (!isNaN(bidPrice)) {
                const validation = validateBuyBid({ bidPrice, bidStorageTarget: undefined }, resource, assets);
                if (!validation.isValid) {
                    validationErrors.bidPrice = validation.error;
                }
            }
        }

        if (local.bidStorageTarget !== '') {
            const bidStorageTarget = parseFloat(local.bidStorageTarget);
            if (!isNaN(bidStorageTarget) && bidStorageTarget < 0) {
                validationErrors.bidStorageTarget = 'Storage target must be non-negative';
            }
        }

        if (JSON.stringify(validationErrors) !== JSON.stringify(local.validationErrors)) {
            onLocalChange(resourceName, { validationErrors });
        }
    }, [
        local.offerPrice,
        local.offerRetainment,
        local.bidPrice,
        local.bidStorageTarget,
        resource,
        inventoryQty,
        assets,
        local,
        resourceName,
        onLocalChange,
        local.validationErrors,
    ]);

    const sellMutation = useMutation(
        trpc.setSellOffers.mutationOptions({
            onSuccess: () => {
                setSellSuccessMsg('Sell offers saved. Changes take effect on the next market tick.');
                setSellErrorMsg(null);
                onLocalChange(resourceName, {
                    savedOfferPrice: local.offerPrice,
                    savedOfferRetainment: local.offerRetainment,
                    savedOfferAutomated: local.offerAutomated,
                });
            },
            onError: (err) => {
                let errorMessage = err instanceof Error ? err.message : 'Failed to update sell offers';
                if (errorMessage.includes('Insufficient deposits')) {
                    errorMessage = `${errorMessage}. You can borrow funds on the <a href="/planets/${planetId}/agent/${agentId}/financial" class="underline font-medium hover:text-blue-700">Financial page</a>.`;
                }
                setSellErrorMsg(errorMessage);
                setSellSuccessMsg(null);
            },
        }),
    );

    const buyMutation = useMutation(
        trpc.setBuyBids.mutationOptions({
            onSuccess: () => {
                setBuySuccessMsg('Buy bids saved. Changes take effect on the next market tick.');
                setBuyErrorMsg(null);
                onLocalChange(resourceName, {
                    savedBidPrice: local.bidPrice,
                    savedBidStorageTarget: local.bidStorageTarget,
                    savedBidAutomated: local.bidAutomated,
                });
            },
            onError: (err) => {
                let errorMessage = err instanceof Error ? err.message : 'Failed to update buy bids';
                if (errorMessage.includes('Insufficient deposits')) {
                    errorMessage = `${errorMessage}. You can borrow funds on the <a href="/planets/${planetId}/agent/${agentId}/financial" class="underline font-medium hover:text-blue-700">Financial page</a>.`;
                }
                setBuyErrorMsg(errorMessage);
                setBuySuccessMsg(null);
            },
        }),
    );

    const cancelSellOfferMutation = useMutation(
        trpc.cancelSellOffer.mutationOptions({
            onSuccess: () => {
                setSellSuccessMsg('Sell offer cancelled.');
                setSellErrorMsg(null);
                onLocalChange(resourceName, {
                    offerPrice: '',
                    offerRetainment: '',
                    offerAutomated: false,
                    savedOfferPrice: '',
                    savedOfferRetainment: '',
                    savedOfferAutomated: false,
                });
            },
            onError: (err) => {
                setSellErrorMsg(err instanceof Error ? err.message : 'Failed to cancel offer');
                setSellSuccessMsg(null);
            },
        }),
    );

    const cancelBuyBidMutation = useMutation(
        trpc.cancelBuyBid.mutationOptions({
            onSuccess: () => {
                setBuySuccessMsg('Buy bid cancelled.');
                setBuyErrorMsg(null);
                onLocalChange(resourceName, {
                    bidPrice: '',
                    bidStorageTarget: '',
                    bidAutomated: false,
                    savedBidPrice: '',
                    savedBidStorageTarget: '',
                    savedBidAutomated: false,
                });
            },
            onError: (err) => {
                setBuyErrorMsg(err instanceof Error ? err.message : 'Failed to cancel bid');
                setBuySuccessMsg(null);
            },
        }),
    );

    const buySaving = buyMutation.isPending || cancelBuyBidMutation.isPending;
    const sellSaving = sellMutation.isPending || cancelSellOfferMutation.isPending;

    const handleSaveBuy = () => {
        setBuySuccessMsg(null);
        setBuyErrorMsg(null);

        if (!resource) {
            setBuyErrorMsg(`Unknown resource: ${resourceName}`);
            return;
        }

        const bidPrice = parseFloat(local.bidPrice);
        const bidStorageTarget = parseFloat(local.bidStorageTarget);

        if (!isNaN(bidPrice) || !isNaN(bidStorageTarget)) {
            const validation = validateBuyBid(
                {
                    bidPrice: isNaN(bidPrice) ? undefined : bidPrice,
                    bidStorageTarget: isNaN(bidStorageTarget) ? undefined : bidStorageTarget,
                },
                resource,
                assets,
            );
            if (!validation.isValid) {
                let errorText = validation.error;
                if (errorText && errorText.includes('Insufficient deposits')) {
                    errorText = `${errorText}. You can borrow funds on the <a href="/planets/${planetId}/agent/${agentId}/financial" class="underline font-medium hover:text-blue-700">Financial page</a>.`;
                }
                setBuyErrorMsg(`Buy validation failed: ${errorText}`);
                return;
            }
        }

        const buyPayload: Record<string, { bidPrice?: number; bidStorageTarget?: number }> = {
            [resourceName]: {
                ...(!isNaN(bidPrice) && bidPrice > 0 && { bidPrice }),
                ...(!isNaN(bidStorageTarget) && bidStorageTarget >= 0 && { bidStorageTarget }),
            },
        };

        buyMutation.mutate({ agentId, planetId, bids: buyPayload });
    };

    const handleSaveSell = () => {
        setSellSuccessMsg(null);
        setSellErrorMsg(null);

        if (!resource) {
            setSellErrorMsg(`Unknown resource: ${resourceName}`);
            return;
        }

        const offerPrice = parseFloat(local.offerPrice);
        const offerRetainment = parseFloat(local.offerRetainment);

        if (!isNaN(offerPrice)) {
            const validation = validateSellOffer(!isNaN(offerPrice) ? offerPrice : undefined, inventoryQty);
            if (!validation.isValid) {
                setSellErrorMsg(`Sell validation failed: ${validation.error}`);
                return;
            }
        }

        const sellPayload: Record<string, { offerPrice?: number; offerRetainment?: number }> = {
            [resourceName]: {
                ...(!isNaN(offerPrice) && offerPrice >= PRICE_FLOOR && { offerPrice }),
                ...(!isNaN(offerRetainment) && offerRetainment >= 0 && { offerRetainment }),
            },
        };

        sellMutation.mutate({ agentId, planetId, offers: sellPayload });
    };

    const handleResetBuy = () => {
        onLocalChange(resourceName, {
            bidPrice: local.savedBidPrice,
            bidStorageTarget: local.savedBidStorageTarget,
        });
        setBuySuccessMsg(null);
        setBuyErrorMsg(null);
    };

    const handleResetSell = () => {
        onLocalChange(resourceName, {
            offerPrice: local.savedOfferPrice,
            offerRetainment: local.savedOfferRetainment,
        });
        setSellSuccessMsg(null);
        setSellErrorMsg(null);
    };

    const handleBuyAutomationChange = (automated: boolean) => {
        onLocalChange(resourceName, { bidAutomated: automated, savedBidAutomated: automated });
        const buyPayload: Record<string, { automated?: boolean }> = {
            [resourceName]: { automated },
        };
        buyMutation.mutate({ agentId, planetId, bids: buyPayload });
    };

    const handleSellAutomationChange = (automated: boolean) => {
        onLocalChange(resourceName, { offerAutomated: automated, savedOfferAutomated: automated });
        const sellPayload: Record<string, { automated?: boolean }> = {
            [resourceName]: { automated },
        };
        sellMutation.mutate({ agentId, planetId, offers: sellPayload });
    };

    // ── Auto-config save / reset handlers ────────────────────────────────────

    const handleSaveBuyAutoConfig = () => {
        setBuyAutoConfigSuccessMsg(null);
        setBuyAutoConfigErrorMsg(null);
        const autoConfig = localToAutoConfig(local.buyAutoConfig);
        const buyPayload: Record<string, { autoConfig?: import('@/simulation/planet/planet').AutomatedPricingConfig }> =
            {
                [resourceName]: { autoConfig },
            };
        buyMutation.mutate(
            { agentId, planetId, bids: buyPayload },
            {
                onSuccess: () => {
                    setBuyAutoConfigSuccessMsg('Auto-config saved.');
                },
                onError: (err) => {
                    setBuyAutoConfigErrorMsg(err instanceof Error ? err.message : 'Failed to save');
                },
            },
        );
    };

    const handleResetBuyAutoConfig = () => {
        onLocalChange(resourceName, { buyAutoConfig: autoConfigToLocal(bid?.autoConfig) });
        setBuyAutoConfigSuccessMsg(null);
        setBuyAutoConfigErrorMsg(null);
    };

    const handleSaveSellAutoConfig = () => {
        setSellAutoConfigSuccessMsg(null);
        setSellAutoConfigErrorMsg(null);
        const autoConfig = localToAutoConfig(local.sellAutoConfig);
        const sellPayload: Record<
            string,
            { autoConfig?: import('@/simulation/planet/planet').AutomatedPricingConfig }
        > = {
            [resourceName]: { autoConfig },
        };
        sellMutation.mutate(
            { agentId, planetId, offers: sellPayload },
            {
                onSuccess: () => {
                    setSellAutoConfigSuccessMsg('Auto-config saved.');
                },
                onError: (err) => {
                    setSellAutoConfigErrorMsg(err instanceof Error ? err.message : 'Failed to save');
                },
            },
        );
    };

    const handleResetSellAutoConfig = () => {
        onLocalChange(resourceName, { sellAutoConfig: autoConfigToLocal(offer?.autoConfig) });
        setSellAutoConfigSuccessMsg(null);
        setSellAutoConfigErrorMsg(null);
    };

    return (
        <AccordionItem value={resourceName} id={resourceNameToSlug(resourceName)}>
            <AccordionTrigger className='hover:no-underline px-1'>
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

                    <Separator />

                    <span className='flex flex-col gap-3 text-xs font-medium text-muted-foreground'>
                        <span className=''>Daily market clearance chart </span>
                        <MarketStepChart
                            market={marketData?.market ?? undefined}
                            agentId={agentId}
                            planetId={planetId}
                        />
                    </span>

                    <Separator />

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <BuySection
                            resourceName={resourceName}
                            bid={bid}
                            local={local}
                            assets={assets}
                            overviewRow={overviewRow}
                            onLocalChange={onLocalChange}
                            onSaveBuy={handleSaveBuy}
                            onResetBuy={handleResetBuy}
                            onCancelBid={() => cancelBuyBidMutation.mutate({ agentId, planetId, resourceName })}
                            onAutomationChange={handleBuyAutomationChange}
                            onSaveBuyAutoConfig={handleSaveBuyAutoConfig}
                            onResetBuyAutoConfig={handleResetBuyAutoConfig}
                            buySaving={buySaving}
                            buyAutoConfigSuccessMsg={buyAutoConfigSuccessMsg}
                            buyAutoConfigErrorMsg={buyAutoConfigErrorMsg}
                            buySuccessMsg={buySuccessMsg}
                            buyErrorMsg={buyErrorMsg}
                            planetId={planetId}
                            ships={ships}
                        />

                        <SellSection
                            resourceName={resourceName}
                            offer={offer}
                            local={local}
                            assets={assets}
                            overviewRow={overviewRow}
                            onLocalChange={onLocalChange}
                            onSaveSell={handleSaveSell}
                            onResetSell={handleResetSell}
                            onCancelOffer={() => cancelSellOfferMutation.mutate({ agentId, planetId, resourceName })}
                            onAutomationChange={handleSellAutomationChange}
                            onSaveSellAutoConfig={handleSaveSellAutoConfig}
                            onResetSellAutoConfig={handleResetSellAutoConfig}
                            sellSaving={sellSaving}
                            sellAutoConfigSuccessMsg={sellAutoConfigSuccessMsg}
                            sellAutoConfigErrorMsg={sellAutoConfigErrorMsg}
                            sellSuccessMsg={sellSuccessMsg}
                            sellErrorMsg={sellErrorMsg}
                            planetId={planetId}
                        />
                    </div>
                </div>
            </AccordionContent>
        </AccordionItem>
    );
}
