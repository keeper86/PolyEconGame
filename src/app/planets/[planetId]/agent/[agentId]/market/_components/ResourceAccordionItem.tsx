'use client';

import { MARKET_COLUMNS } from '@/app/planets/[planetId]/agent/[agentId]/market/_components/columnConfig';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAddPendingAction, usePendingActions, useRemovePendingByResource } from '@/hooks/useActionOverlay';
import { useSimulationQuery, useSimulationTick } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit, resourceFormToUnit } from '@/lib/utils';
import { PRICE_FLOOR } from '@/simulation/constants';
import { CURRENCY_RESOURCE_PREFIX, currencyMapping } from '@/simulation/market/currencyResources';
import { validateBuyBid, validateSellOffer } from '@/simulation/market/validation';
import { useMutation } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import React, { useState } from 'react';
import { toast } from 'sonner';
import BuySection from './BuySection';
import MarketStepChart from './MarketStepChart';
import ProductPriceHistoryChart from './ProductPriceHistoryChart';
import ResourceTrigger from './ResourceTrigger';
import SellSection from './SellSection';
import { getResourceByName, resourceNameToSlug } from './marketHelpers';
import type { ResourceAccordionItemProps } from './marketTypes';
import { autoConfigToLocal, BANDS_FOR_RATIO_CLEARING_PRICE_TO_PRODUCTION_COST, localToAutoConfig } from './marketTypes';

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

    // ── Pending market actions ──────────────────────────────────────────────
    const addPending = useAddPendingAction();
    const removePendingByResource = useRemovePendingByResource();
    const currentTick = useSimulationTick();
    const pendingActions = usePendingActions(agentId, planetId);

    const resource = getResourceByName(resourceName);

    const issuingPlanetId = resourceName.startsWith('CUR_') ? resourceName.slice(4) : null;
    const displayName = issuingPlanetId ? currencyMapping[issuingPlanetId]?.resource.name : undefined;

    const sellMutation = useMutation(
        trpc.setSellOffers.mutationOptions({
            onSuccess: () => {
                toast.success('Sell offers saved. Changes take effect on the next market tick.');
                onLocalChange(resourceName, {
                    savedOfferPrice: local.offerPrice,
                    savedOfferAutomated: local.offerAutomated,
                });
            },
            onError: (err) => {
                const errorMessage = err instanceof Error ? err.message : 'Failed to update sell offers';
                if (errorMessage.includes('Insufficient deposits')) {
                    toast.error(
                        <span>
                            {errorMessage}. You can borrow funds on the{' '}
                            <a
                                href={`/planets/${planetId}/agent/${agentId}/financial`}
                                className='underline font-medium hover:text-blue-700'
                            >
                                Financial page
                            </a>
                            .
                        </span>,
                    );
                } else {
                    toast.error(errorMessage);
                }
                // Remove pending action on error (we remove all sell sub-types)
                removePendingByResource(agentId, planetId, resourceName, 'marketSellPrice');
                removePendingByResource(agentId, planetId, resourceName, 'marketSellAutomation');
                removePendingByResource(agentId, planetId, resourceName, 'marketSellAutoConfig');
            },
        }),
    );

    const buyMutation = useMutation(
        trpc.setBuyBids.mutationOptions({
            onSuccess: () => {
                toast.success('Buy bids saved. Changes take effect on the next market tick.');
                onLocalChange(resourceName, {
                    savedBidPrice: local.bidPrice,
                    savedBidAutomated: local.bidAutomated,
                });
            },
            onError: (err) => {
                const errorMessage = err instanceof Error ? err.message : 'Failed to update buy bids';
                if (errorMessage.includes('Insufficient deposits')) {
                    toast.error(
                        <span>
                            {errorMessage}. You can borrow funds on the{' '}
                            <a
                                href={`/planets/${planetId}/agent/${agentId}/financial`}
                                className='underline font-medium hover:text-blue-700'
                            >
                                Financial page
                            </a>
                            .
                        </span>,
                    );
                } else {
                    toast.error(errorMessage);
                }
                // Remove pending action on error (we remove all buy sub-types)
                removePendingByResource(agentId, planetId, resourceName, 'marketBuyPrice');
                removePendingByResource(agentId, planetId, resourceName, 'marketBuyAutomation');
                removePendingByResource(agentId, planetId, resourceName, 'marketBuyAutoConfig');
            },
        }),
    );

    const cancelSellOfferMutation = useMutation(
        trpc.cancelSellOffer.mutationOptions({
            onSuccess: () => {
                toast.success('Sell offer cancelled.');
                onLocalChange(resourceName, {
                    offerPrice: '',
                    offerAutomated: false,
                    savedOfferPrice: '',
                    savedOfferAutomated: false,
                });
                // Remove cancel pending on success; resolution handles the rest
                removePendingByResource(agentId, planetId, resourceName, 'marketCancelSell');
            },
            onError: (err) => {
                toast.error(err instanceof Error ? err.message : 'Failed to cancel offer');
                removePendingByResource(agentId, planetId, resourceName, 'marketCancelSell');
            },
        }),
    );

    const cancelBuyBidMutation = useMutation(
        trpc.cancelBuyBid.mutationOptions({
            onSuccess: () => {
                toast.success('Buy bid cancelled.');
                onLocalChange(resourceName, {
                    bidPrice: '',
                    bidAutomated: false,
                    savedBidPrice: '',
                    savedBidAutomated: false,
                });
                // Remove cancel pending on success
                removePendingByResource(agentId, planetId, resourceName, 'marketCancelBuy');
            },
            onError: (err) => {
                toast.error(err instanceof Error ? err.message : 'Failed to cancel bid');
                removePendingByResource(agentId, planetId, resourceName, 'marketCancelBuy');
            },
        }),
    );

    const [buyPriceSaving, setBuyPriceSaving] = useState(false);
    const [buyAutomationSaving, setBuyAutomationSaving] = useState(false);
    const [buyAutoConfigSaving, setBuyAutoConfigSaving] = useState(false);
    const [sellPriceSaving, setSellPriceSaving] = useState(false);
    const [sellAutomationSaving, setSellAutomationSaving] = useState(false);
    const [sellAutoConfigSaving, setSellAutoConfigSaving] = useState(false);
    const [chartOpen, setChartOpen] = useState(false);

    const handleSaveBuy = () => {
        if (!resource) {
            toast.error(`Unknown resource: ${resourceName}`);
            return;
        }

        const bidPrice = parseFloat(local.bidPrice);

        if (!isNaN(bidPrice) && bidPrice > 0) {
            const validation = validateBuyBid(
                {
                    bidPrice,
                    bidStorageTarget: undefined,
                },
                resource,
                assets,
            );
            if (!validation.isValid) {
                const errorText = validation.error;
                if (errorText && errorText.includes('Insufficient deposits')) {
                    toast.error(
                        <span>
                            Buy validation failed: {errorText}. You can borrow funds on the{' '}
                            <a
                                href={`/planets/${planetId}/agent/${agentId}/financial`}
                                className='underline font-medium hover:text-blue-700'
                            >
                                Financial page
                            </a>
                            .
                        </span>,
                    );
                } else {
                    toast.error(`Buy validation failed: ${errorText}`);
                }
                return;
            }
        }

        if (isNaN(bidPrice) || bidPrice <= 0) {
            toast.error(`Buy validation failed: Invalid bid price.`);
            return;
        }

        const buyPayload: Record<string, { bidPrice?: number }> = {
            [resourceName]: {
                bidPrice,
            },
        };

        // Add pending action before mutation (price zone)
        addPending({
            type: 'marketBuyPrice',
            agentId,
            planetId,
            resourceName,
            submittedBidPrice: isNaN(bidPrice) ? undefined : bidPrice,
            submittedBidStorageTarget: undefined,
            triggerTick: currentTick,
        });

        setBuyPriceSaving(true);
        buyMutation.mutate(
            { agentId, planetId, bids: buyPayload },
            {
                onSuccess: () => setBuyPriceSaving(false),
                onError: () => setBuyPriceSaving(false),
            },
        );
    };

    const handleSaveSell = () => {
        if (!resource) {
            toast.error(`Unknown resource: ${resourceName}`);
            return;
        }

        const offerPrice = parseFloat(local.offerPrice);

        if (!isNaN(offerPrice)) {
            const validation = validateSellOffer(offerPrice, inventoryQty);
            if (!validation.isValid) {
                toast.error(`Sell validation failed: ${validation.error}`);
                return;
            }
        }

        if (isNaN(offerPrice) || offerPrice < PRICE_FLOOR) {
            toast.error(`Sell validation failed: Invalid offer price.`);
            return;
        }

        const sellPayload: Record<string, { offerPrice?: number }> = {
            [resourceName]: {
                offerPrice,
            },
        };

        // Add pending action before mutation (price zone)
        addPending({
            type: 'marketSellPrice',
            agentId,
            planetId,
            resourceName,
            submittedOfferPrice: isNaN(offerPrice) ? undefined : offerPrice,
            triggerTick: currentTick,
        });

        setSellPriceSaving(true);
        sellMutation.mutate(
            { agentId, planetId, offers: sellPayload },
            {
                onSuccess: () => setSellPriceSaving(false),
                onError: () => setSellPriceSaving(false),
            },
        );
    };

    const handleResetBuy = () => {
        onLocalChange(resourceName, {
            bidPrice: local.savedBidPrice,
        });
    };

    const handleResetSell = () => {
        onLocalChange(resourceName, {
            offerPrice: local.savedOfferPrice,
        });
    };

    const handleBuyAutomationChange = (automated: boolean) => {
        onLocalChange(resourceName, { bidAutomated: automated, savedBidAutomated: automated });

        // Add pending action for automation toggle
        addPending({
            type: 'marketBuyAutomation',
            agentId,
            planetId,
            resourceName,
            submittedBidAutomated: automated,
            triggerTick: currentTick,
        });

        setBuyAutomationSaving(true);
        const buyPayload: Record<string, { automated?: boolean }> = {
            [resourceName]: { automated },
        };
        buyMutation.mutate(
            { agentId, planetId, bids: buyPayload },
            {
                onSuccess: () => {
                    setBuyAutomationSaving(false);
                    toast.success('Buy bids saved. Changes take effect on the next market tick.');
                },
                onError: (err) => {
                    setBuyAutomationSaving(false);
                    const errorMessage = err instanceof Error ? err.message : 'Failed to update buy bids';
                    if (errorMessage.includes('Insufficient deposits')) {
                        toast.error(
                            <span>
                                {errorMessage}. You can borrow funds on the{' '}
                                <a
                                    href={`/planets/${planetId}/agent/${agentId}/financial`}
                                    className='underline font-medium hover:text-blue-700'
                                >
                                    Financial page
                                </a>
                                .
                            </span>,
                        );
                    } else {
                        toast.error(errorMessage);
                    }
                    removePendingByResource(agentId, planetId, resourceName, 'marketBuyAutomation');
                },
            },
        );
    };

    const handleSellAutomationChange = (automated: boolean) => {
        onLocalChange(resourceName, { offerAutomated: automated, savedOfferAutomated: automated });

        // Add pending action for automation toggle
        addPending({
            type: 'marketSellAutomation',
            agentId,
            planetId,
            resourceName,
            submittedOfferAutomated: automated,
            triggerTick: currentTick,
        });

        setSellAutomationSaving(true);
        const sellPayload: Record<string, { automated?: boolean }> = {
            [resourceName]: { automated },
        };
        sellMutation.mutate(
            { agentId, planetId, offers: sellPayload },
            {
                onSuccess: () => {
                    setSellAutomationSaving(false);
                    toast.success('Sell offers saved. Changes take effect on the next market tick.');
                },
                onError: (err) => {
                    setSellAutomationSaving(false);
                    const errorMessage = err instanceof Error ? err.message : 'Failed to update sell offers';
                    if (errorMessage.includes('Insufficient deposits')) {
                        toast.error(
                            <span>
                                {errorMessage}. You can borrow funds on the{' '}
                                <a
                                    href={`/planets/${planetId}/agent/${agentId}/financial`}
                                    className='underline font-medium hover:text-blue-700'
                                >
                                    Financial page
                                </a>
                                .
                            </span>,
                        );
                    } else {
                        toast.error(errorMessage);
                    }
                    removePendingByResource(agentId, planetId, resourceName, 'marketSellAutomation');
                },
            },
        );
    };

    // ── Cancel bid/offer handlers with pending actions ──────────────────────

    const handleCancelBid = () => {
        addPending({
            type: 'marketCancelBuy',
            agentId,
            planetId,
            resourceName,
            triggerTick: currentTick,
        });
        cancelBuyBidMutation.mutate({ agentId, planetId, resourceName });
    };

    const handleCancelOffer = () => {
        addPending({
            type: 'marketCancelSell',
            agentId,
            planetId,
            resourceName,
            triggerTick: currentTick,
        });
        cancelSellOfferMutation.mutate({ agentId, planetId, resourceName });
    };

    // ── Auto-config save / reset handlers ────────────────────────────────────

    const handleSaveBuyAutoConfig = () => {
        const autoConfig = localToAutoConfig(local.buyAutoConfig);
        const buyPayload: Record<string, { autoConfig?: import('@/simulation/planet/planet').AutomatedPricingConfig }> =
            {
                [resourceName]: { autoConfig },
            };

        // Add pending action for auto-config save
        addPending({
            type: 'marketBuyAutoConfig',
            agentId,
            planetId,
            resourceName,
            triggerTick: currentTick,
        });

        setBuyAutoConfigSaving(true);
        buyMutation.mutate(
            { agentId, planetId, bids: buyPayload },
            {
                onSuccess: () => {
                    setBuyAutoConfigSaving(false);
                    toast.success('Auto-config saved.');
                },
                onError: (err) => {
                    setBuyAutoConfigSaving(false);
                    toast.error(err instanceof Error ? err.message : 'Failed to save');
                    removePendingByResource(agentId, planetId, resourceName, 'marketBuyAutoConfig');
                },
            },
        );
    };

    const handleResetBuyAutoConfig = () => {
        onLocalChange(resourceName, { buyAutoConfig: autoConfigToLocal(bid?.autoConfig) });
    };

    const handleSaveSellAutoConfig = () => {
        const autoConfig = localToAutoConfig(local.sellAutoConfig);
        const sellPayload: Record<
            string,
            { autoConfig?: import('@/simulation/planet/planet').AutomatedPricingConfig }
        > = {
            [resourceName]: { autoConfig },
        };

        // Add pending action for auto-config save
        addPending({
            type: 'marketSellAutoConfig',
            agentId,
            planetId,
            resourceName,
            triggerTick: currentTick,
        });

        setSellAutoConfigSaving(true);
        sellMutation.mutate(
            { agentId, planetId, offers: sellPayload },
            {
                onSuccess: () => {
                    setSellAutoConfigSaving(false);
                    toast.success('Auto-config saved.');
                },
                onError: (err) => {
                    setSellAutoConfigSaving(false);
                    toast.error(err instanceof Error ? err.message : 'Failed to save');
                    removePendingByResource(agentId, planetId, resourceName, 'marketSellAutoConfig');
                },
            },
        );
    };

    const handleResetSellAutoConfig = () => {
        onLocalChange(resourceName, { sellAutoConfig: autoConfigToLocal(offer?.autoConfig) });
    };

    // ── Granular overlay messages ──────────────────────────────────────────
    // Zone 1: Automation toggle
    // Zone 2: Auto-config
    // Zone 3: Price/quantity inputs + save/reset
    // Each zone can be independently in "Saving…" (mutation in flight) or "Awaiting next day…" (pending).

    const pendingBuyPriceAction = pendingActions.find(
        (a) => a.type === 'marketBuyPrice' && a.resourceName === resourceName,
    );
    const pendingBuyAutomationAction = pendingActions.find(
        (a) => a.type === 'marketBuyAutomation' && a.resourceName === resourceName,
    );
    const pendingBuyAutoConfigAction = pendingActions.find(
        (a) => a.type === 'marketBuyAutoConfig' && a.resourceName === resourceName,
    );
    const pendingSellPriceAction = pendingActions.find(
        (a) => a.type === 'marketSellPrice' && a.resourceName === resourceName,
    );
    const pendingSellAutomationAction = pendingActions.find(
        (a) => a.type === 'marketSellAutomation' && a.resourceName === resourceName,
    );
    const pendingSellAutoConfigAction = pendingActions.find(
        (a) => a.type === 'marketSellAutoConfig' && a.resourceName === resourceName,
    );

    // Buy overlays — each zone uses its own granular saving flag
    const buyAutomationOverlay = buyAutomationSaving
        ? 'Saving…'
        : pendingBuyAutomationAction
          ? 'Awaiting next day…'
          : null;

    const buyPriceOverlay = buyPriceSaving ? 'Saving…' : pendingBuyPriceAction ? 'Awaiting next day…' : null;

    const buyAutoConfigOverlay = buyAutoConfigSaving
        ? 'Saving…'
        : pendingBuyAutoConfigAction
          ? 'Awaiting next day…'
          : null;

    // Sell overlays — each zone uses its own granular saving flag
    const sellAutomationOverlay = sellAutomationSaving
        ? 'Saving…'
        : pendingSellAutomationAction
          ? 'Awaiting next day…'
          : null;

    const sellPriceOverlay = sellPriceSaving ? 'Saving…' : pendingSellPriceAction ? 'Awaiting next day…' : null;

    const sellAutoConfigOverlay = sellAutoConfigSaving
        ? 'Saving…'
        : pendingSellAutoConfigAction
          ? 'Awaiting next day…'
          : null;

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

                    <div className='flex flex-row flex-wrap gap-8'>
                        <BuySection
                            resourceName={resourceName}
                            bid={bid}
                            local={local}
                            assets={assets}
                            overviewRow={overviewRow}
                            onLocalChange={onLocalChange}
                            onSaveBuy={handleSaveBuy}
                            onResetBuy={handleResetBuy}
                            onCancelBid={handleCancelBid}
                            onAutomationChange={handleBuyAutomationChange}
                            onSaveBuyAutoConfig={handleSaveBuyAutoConfig}
                            onResetBuyAutoConfig={handleResetBuyAutoConfig}
                            buyAutomationSaving={buyAutomationSaving}
                            buyPriceSaving={buyPriceSaving}
                            buyAutoConfigSaving={buyAutoConfigSaving}
                            planetId={planetId}
                            ships={ships}
                            buyAutomationOverlay={buyAutomationOverlay}
                            buyAutoConfigOverlay={buyAutoConfigOverlay}
                            buyPriceOverlay={buyPriceOverlay}
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
                            onCancelOffer={handleCancelOffer}
                            onAutomationChange={handleSellAutomationChange}
                            onSaveSellAutoConfig={handleSaveSellAutoConfig}
                            onResetSellAutoConfig={handleResetSellAutoConfig}
                            sellAutomationSaving={sellAutomationSaving}
                            sellPriceSaving={sellPriceSaving}
                            sellAutoConfigSaving={sellAutoConfigSaving}
                            planetId={planetId}
                            sellAutomationOverlay={sellAutomationOverlay}
                            sellAutoConfigOverlay={sellAutoConfigOverlay}
                            sellPriceOverlay={sellPriceOverlay}
                        />
                    </div>

                    <div className='flex flex-col gap-3'>
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
