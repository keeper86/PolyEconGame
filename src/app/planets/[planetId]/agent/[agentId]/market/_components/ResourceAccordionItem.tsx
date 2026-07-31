'use client';

import { MARKET_COLUMNS } from '@/app/planets/[planetId]/agent/[agentId]/market/_components/columnConfig';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAddPendingAction, usePendingActions } from '@/hooks/useActionOverlay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit, resourceFormToUnit } from '@/lib/utils';
import { PRICE_FLOOR } from '@/simulation/constants';
import { CURRENCY_RESOURCE_PREFIX, currencyMapping } from '@/simulation/market/currencyResources';
import { validateBuyBid, validateSellOffer } from '@/simulation/market/validation';
import { useMutation } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useTour } from '@/components/tour/TourContext';
import React, { useState } from 'react';
import { toast } from 'sonner';
import BuySection from './BuySection';
import MarketStepChart from './MarketStepChart';
import ProductPriceHistoryChart from './ProductPriceHistoryChart';
import ResourceTrigger from './ResourceTrigger';
import SellSection from './SellSection';
import { getResourceByName, resourceNameToSlug } from './marketHelpers';
import type { ResourceAccordionItemProps } from './marketTypes';
import { BANDS_FOR_RATIO_CLEARING_PRICE_TO_PRODUCTION_COST, localToAutoConfig } from './marketTypes';

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

    const addPending = useAddPendingAction();
    const pendingActions = usePendingActions(agentId, planetId);

    const resource = getResourceByName(resourceName);

    const issuingPlanetId = resourceName.startsWith('CUR_') ? resourceName.slice(4) : null;
    const displayName = issuingPlanetId ? currencyMapping[issuingPlanetId]?.resource.name : undefined;

    const sellMutation = useMutation(
        trpc.setSellOffers.mutationOptions({
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
            },
        }),
    );

    const buyMutation = useMutation(
        trpc.setBuyBids.mutationOptions({
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
            },
        }),
    );

    const cancelSellOfferMutation = useMutation(
        trpc.cancelSellOffer.mutationOptions({
            onSuccess: (data) => {
                toast.success('Sell offer cancelled.');
                onLocalChange(resourceName, {
                    offerPrice: '',
                    offerAutomated: false,
                    savedOfferPrice: '',
                    savedOfferAutomated: false,
                });
                if (data) {
                    addPending({
                        type: 'marketCancelSell',
                        agentId,
                        planetId,
                        resourceName,
                        triggerTick: data.processedAtTick,
                    });
                }
            },
            onError: (err) => {
                toast.error(err instanceof Error ? err.message : 'Failed to cancel offer');
            },
        }),
    );

    const cancelBuyBidMutation = useMutation(
        trpc.cancelBuyBid.mutationOptions({
            onSuccess: (data) => {
                toast.success('Buy bid cancelled.');
                onLocalChange(resourceName, {
                    bidPrice: '',
                    bidAutomated: false,
                    savedBidPrice: '',
                    savedBidAutomated: false,
                });
                if (data) {
                    addPending({
                        type: 'marketCancelBuy',
                        agentId,
                        planetId,
                        resourceName,
                        triggerTick: data.processedAtTick,
                    });
                }
            },
            onError: (err) => {
                toast.error(err instanceof Error ? err.message : 'Failed to cancel bid');
            },
        }),
    );

    const [buyPriceSaving, setBuyPriceSaving] = useState(false);
    const [buyAutomationSaving, setBuyAutomationSaving] = useState(false);
    const [buyPricingConfigSaving, setBuyPricingConfigSaving] = useState(false);
    const [buyVolumeConfigSaving, setBuyVolumeConfigSaving] = useState(false);
    const [sellPriceSaving, setSellPriceSaving] = useState(false);
    const [sellAutomationSaving, setSellAutomationSaving] = useState(false);
    const [sellPricingConfigSaving, setSellPricingConfigSaving] = useState(false);
    const [sellVolumeConfigSaving, setSellVolumeConfigSaving] = useState(false);

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

        setBuyPriceSaving(true);
        buyMutation.mutate(
            { agentId, planetId, bids: buyPayload },
            {
                onSuccess: (data) => {
                    setBuyPriceSaving(false);
                    onLocalChange(resourceName, { savedBidPrice: local.bidPrice });
                    if (data) {
                        addPending({
                            type: 'marketBuyPrice',
                            agentId,
                            planetId,
                            resourceName,
                            triggerTick: data.processedAtTick,
                        });
                    }
                },
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

        setSellPriceSaving(true);
        sellMutation.mutate(
            { agentId, planetId, offers: sellPayload },
            {
                onSuccess: (data) => {
                    setSellPriceSaving(false);
                    onLocalChange(resourceName, { savedOfferPrice: local.offerPrice });
                    if (data) {
                        addPending({
                            type: 'marketSellPrice',
                            agentId,
                            planetId,
                            resourceName,
                            triggerTick: data.processedAtTick,
                        });
                    }
                },
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

    const { isTourActive: marketIsTourActive, markActionCompleted: marketMarkActionCompleted } = useTour();

    const handleBuyAutomationChange = (automated: boolean) => {
        onLocalChange(resourceName, { bidAutomated: automated, savedBidAutomated: automated });

        if (automated && resourceName === 'Construction' && marketIsTourActive) {
            marketMarkActionCompleted('enable-buy-construction');
        }

        setBuyAutomationSaving(true);
        const buyPayload: Record<string, { automated?: boolean }> = {
            [resourceName]: { automated },
        };
        buyMutation.mutate(
            { agentId, planetId, bids: buyPayload },
            {
                onSuccess: (data) => {
                    setBuyAutomationSaving(false);
                    onLocalChange(resourceName, { savedBidAutomated: automated });
                    if (data) {
                        addPending({
                            type: 'marketBuyAutomation',
                            agentId,
                            planetId,
                            resourceName,
                            triggerTick: data.processedAtTick,
                        });
                    }
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
                },
            },
        );
    };

    const handleSellAutomationChange = (automated: boolean) => {
        onLocalChange(resourceName, { offerAutomated: automated, savedOfferAutomated: automated });

        setSellAutomationSaving(true);
        const sellPayload: Record<string, { automated?: boolean }> = {
            [resourceName]: { automated },
        };
        sellMutation.mutate(
            { agentId, planetId, offers: sellPayload },
            {
                onSuccess: (data) => {
                    setSellAutomationSaving(false);
                    onLocalChange(resourceName, { savedOfferAutomated: automated });
                    if (data) {
                        addPending({
                            type: 'marketSellAutomation',
                            agentId,
                            planetId,
                            resourceName,
                            triggerTick: data.processedAtTick,
                        });
                    }
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
                },
            },
        );
    };

    const handleCancelBid = () => {
        cancelBuyBidMutation.mutate({ agentId, planetId, resourceName });
    };

    const handleCancelOffer = () => {
        cancelSellOfferMutation.mutate({ agentId, planetId, resourceName });
    };

    const BUY_PRICING_KEYS = [
        'priceAdjustMaxUp',
        'priceAdjustMaxDown',
        'bidOfferMaxCostMultiplier',
        'targetFillRate',
    ] as const;
    const BUY_VOLUME_KEYS = [
        'inputBufferTargetTicks',
        'inventorySmoothingMaxExtra',
        'freeBuyQuantity',
        'freeBuyQuantitySmoothingMaxExtra',
    ] as const;
    const SELL_PRICING_KEYS = [
        'priceAdjustMaxUp',
        'priceAdjustMaxDown',
        'automatedCostFloorBuffer',
        'targetSellThrough',
    ] as const;
    const SELL_VOLUME_KEYS = ['freeRetainment', 'freeRetainmentSmoothingMaxExtra'] as const;

    const pickAutoConfigKeys = (source: typeof local.buyAutoConfig, keys: readonly string[]) => {
        const result: Record<string, string> = {};
        for (const k of keys) {
            result[k] = source[k as keyof typeof source];
        }
        return result;
    };

    const commitBuyPricingConfig = (
        autoConfig: import('@/simulation/planet/planet').AutomatedPricingConfig | undefined,
    ) => {
        const keySet = new Set<string>(BUY_PRICING_KEYS as readonly string[]);
        const filtered: Record<string, number> = {};
        if (autoConfig) {
            for (const [k, v] of Object.entries(autoConfig)) {
                if (keySet.has(k)) {
                    filtered[k] = v;
                }
            }
        }
        return Object.keys(filtered).length > 0
            ? (filtered as import('@/simulation/planet/planet').AutomatedPricingConfig)
            : undefined;
    };

    const commitBuyVolumeConfig = (
        autoConfig: import('@/simulation/planet/planet').AutomatedPricingConfig | undefined,
    ) => {
        const keySet = new Set<string>(BUY_VOLUME_KEYS as readonly string[]);
        const filtered: Record<string, number> = {};
        if (autoConfig) {
            for (const [k, v] of Object.entries(autoConfig)) {
                if (keySet.has(k)) {
                    filtered[k] = v;
                }
            }
        }
        return Object.keys(filtered).length > 0
            ? (filtered as import('@/simulation/planet/planet').AutomatedPricingConfig)
            : undefined;
    };

    const commitSellPricingConfig = (
        autoConfig: import('@/simulation/planet/planet').AutomatedPricingConfig | undefined,
    ) => {
        const keySet = new Set<string>(SELL_PRICING_KEYS as readonly string[]);
        const filtered: Record<string, number> = {};
        if (autoConfig) {
            for (const [k, v] of Object.entries(autoConfig)) {
                if (keySet.has(k)) {
                    filtered[k] = v;
                }
            }
        }
        return Object.keys(filtered).length > 0
            ? (filtered as import('@/simulation/planet/planet').AutomatedPricingConfig)
            : undefined;
    };

    const commitSellVolumeConfig = (
        autoConfig: import('@/simulation/planet/planet').AutomatedPricingConfig | undefined,
    ) => {
        const keySet = new Set<string>(SELL_VOLUME_KEYS as readonly string[]);
        const filtered: Record<string, number> = {};
        if (autoConfig) {
            for (const [k, v] of Object.entries(autoConfig)) {
                if (keySet.has(k)) {
                    filtered[k] = v;
                }
            }
        }
        return Object.keys(filtered).length > 0
            ? (filtered as import('@/simulation/planet/planet').AutomatedPricingConfig)
            : undefined;
    };

    const handleSaveBuyPricingConfig = () => {
        const autoConfig = localToAutoConfig(
            pickAutoConfigKeys(
                local.buyAutoConfig,
                BUY_PRICING_KEYS as unknown as string[],
            ) as typeof local.buyAutoConfig,
        );
        const mergedWithCommitted = { ...(bid?.autoConfig ?? {}), ...(autoConfig ?? {}) };
        const filtered = commitBuyPricingConfig(
            mergedWithCommitted as import('@/simulation/planet/planet').AutomatedPricingConfig,
        );
        const buyPayload: Record<string, { autoConfig?: import('@/simulation/planet/planet').AutomatedPricingConfig }> =
            { [resourceName]: { autoConfig: filtered } };

        setBuyPricingConfigSaving(true);
        buyMutation.mutate(
            { agentId, planetId, bids: buyPayload },
            {
                onSuccess: (data) => {
                    setBuyPricingConfigSaving(false);
                    if (data) {
                        addPending({
                            type: 'marketBuyPricingConfig',
                            agentId,
                            planetId,
                            resourceName,
                            triggerTick: data.processedAtTick,
                        });
                    }
                    toast.success('Pricing config saved.');
                },
                onError: (err) => {
                    setBuyPricingConfigSaving(false);
                    toast.error(err instanceof Error ? err.message : 'Failed to save');
                },
            },
        );
    };

    const handleResetBuyPricingConfig = () => {
        const committed = bid?.autoConfig ?? {};
        const current = local.buyAutoConfig;
        const resetFields: Record<string, string> = {};
        for (const k of BUY_PRICING_KEYS) {
            const committedVal = committed[k as keyof typeof committed];
            resetFields[k] = committedVal !== undefined ? String(committedVal) : '';
        }
        onLocalChange(resourceName, { buyAutoConfig: { ...current, ...resetFields } as typeof current });
    };

    const handleSaveBuyVolumeConfig = () => {
        const autoConfig = localToAutoConfig(
            pickAutoConfigKeys(
                local.buyAutoConfig,
                BUY_VOLUME_KEYS as unknown as string[],
            ) as typeof local.buyAutoConfig,
        );
        const mergedWithCommitted = { ...(bid?.autoConfig ?? {}), ...(autoConfig ?? {}) };
        const filtered = commitBuyVolumeConfig(
            mergedWithCommitted as import('@/simulation/planet/planet').AutomatedPricingConfig,
        );
        const buyPayload: Record<string, { autoConfig?: import('@/simulation/planet/planet').AutomatedPricingConfig }> =
            { [resourceName]: { autoConfig: filtered } };

        setBuyVolumeConfigSaving(true);
        buyMutation.mutate(
            { agentId, planetId, bids: buyPayload },
            {
                onSuccess: (data) => {
                    setBuyVolumeConfigSaving(false);
                    if (data) {
                        addPending({
                            type: 'marketBuyVolumeConfig',
                            agentId,
                            planetId,
                            resourceName,
                            triggerTick: data.processedAtTick,
                        });
                    }
                    toast.success('Volume config saved.');
                },
                onError: (err) => {
                    setBuyVolumeConfigSaving(false);
                    toast.error(err instanceof Error ? err.message : 'Failed to save');
                },
            },
        );
    };

    const handleResetBuyVolumeConfig = () => {
        const committed = bid?.autoConfig ?? {};
        const current = local.buyAutoConfig;
        const resetFields: Record<string, string> = {};
        for (const k of BUY_VOLUME_KEYS) {
            const committedVal = committed[k as keyof typeof committed];
            resetFields[k] = committedVal !== undefined ? String(committedVal) : '';
        }
        onLocalChange(resourceName, { buyAutoConfig: { ...current, ...resetFields } as typeof current });
    };

    const handleSaveSellPricingConfig = () => {
        const autoConfig = localToAutoConfig(
            pickAutoConfigKeys(
                local.sellAutoConfig,
                SELL_PRICING_KEYS as unknown as string[],
            ) as typeof local.sellAutoConfig,
        );
        const mergedWithCommitted = { ...(offer?.autoConfig ?? {}), ...(autoConfig ?? {}) };
        const filtered = commitSellPricingConfig(
            mergedWithCommitted as import('@/simulation/planet/planet').AutomatedPricingConfig,
        );
        const sellPayload: Record<
            string,
            { autoConfig?: import('@/simulation/planet/planet').AutomatedPricingConfig }
        > = { [resourceName]: { autoConfig: filtered } };

        setSellPricingConfigSaving(true);
        sellMutation.mutate(
            { agentId, planetId, offers: sellPayload },
            {
                onSuccess: (data) => {
                    setSellPricingConfigSaving(false);
                    if (data) {
                        addPending({
                            type: 'marketSellPricingConfig',
                            agentId,
                            planetId,
                            resourceName,
                            triggerTick: data.processedAtTick,
                        });
                    }
                    toast.success('Pricing config saved.');
                },
                onError: (err) => {
                    setSellPricingConfigSaving(false);
                    toast.error(err instanceof Error ? err.message : 'Failed to save');
                },
            },
        );
    };

    const handleResetSellPricingConfig = () => {
        const committed = offer?.autoConfig ?? {};
        const current = local.sellAutoConfig;
        const resetFields: Record<string, string> = {};
        for (const k of SELL_PRICING_KEYS) {
            const committedVal = committed[k as keyof typeof committed];
            resetFields[k] = committedVal !== undefined ? String(committedVal) : '';
        }
        onLocalChange(resourceName, { sellAutoConfig: { ...current, ...resetFields } as typeof current });
    };

    const handleSaveSellVolumeConfig = () => {
        const autoConfig = localToAutoConfig(
            pickAutoConfigKeys(
                local.sellAutoConfig,
                SELL_VOLUME_KEYS as unknown as string[],
            ) as typeof local.sellAutoConfig,
        );
        const mergedWithCommitted = { ...(offer?.autoConfig ?? {}), ...(autoConfig ?? {}) };
        const filtered = commitSellVolumeConfig(
            mergedWithCommitted as import('@/simulation/planet/planet').AutomatedPricingConfig,
        );
        const sellPayload: Record<
            string,
            { autoConfig?: import('@/simulation/planet/planet').AutomatedPricingConfig }
        > = { [resourceName]: { autoConfig: filtered } };

        setSellVolumeConfigSaving(true);
        sellMutation.mutate(
            { agentId, planetId, offers: sellPayload },
            {
                onSuccess: (data) => {
                    setSellVolumeConfigSaving(false);
                    if (data) {
                        addPending({
                            type: 'marketSellVolumeConfig',
                            agentId,
                            planetId,
                            resourceName,
                            triggerTick: data.processedAtTick,
                        });
                    }
                    toast.success('Volume config saved.');
                },
                onError: (err) => {
                    setSellVolumeConfigSaving(false);
                    toast.error(err instanceof Error ? err.message : 'Failed to save');
                },
            },
        );
    };

    const handleResetSellVolumeConfig = () => {
        const committed = offer?.autoConfig ?? {};
        const current = local.sellAutoConfig;
        const resetFields: Record<string, string> = {};
        for (const k of SELL_VOLUME_KEYS) {
            const committedVal = committed[k as keyof typeof committed];
            resetFields[k] = committedVal !== undefined ? String(committedVal) : '';
        }
        onLocalChange(resourceName, { sellAutoConfig: { ...current, ...resetFields } as typeof current });
    };

    const pendingBuyPriceAction = pendingActions.find(
        (a) => a.type === 'marketBuyPrice' && a.resourceName === resourceName,
    );
    const pendingBuyAutomationAction = pendingActions.find(
        (a) => a.type === 'marketBuyAutomation' && a.resourceName === resourceName,
    );
    const pendingBuyPricingConfigAction = pendingActions.find(
        (a) => a.type === 'marketBuyPricingConfig' && a.resourceName === resourceName,
    );
    const pendingBuyVolumeConfigAction = pendingActions.find(
        (a) => a.type === 'marketBuyVolumeConfig' && a.resourceName === resourceName,
    );
    const pendingSellPriceAction = pendingActions.find(
        (a) => a.type === 'marketSellPrice' && a.resourceName === resourceName,
    );
    const pendingSellAutomationAction = pendingActions.find(
        (a) => a.type === 'marketSellAutomation' && a.resourceName === resourceName,
    );
    const pendingSellPricingConfigAction = pendingActions.find(
        (a) => a.type === 'marketSellPricingConfig' && a.resourceName === resourceName,
    );
    const pendingSellVolumeConfigAction = pendingActions.find(
        (a) => a.type === 'marketSellVolumeConfig' && a.resourceName === resourceName,
    );

    const buyAutomationOverlay = buyAutomationSaving
        ? 'Saving…'
        : pendingBuyAutomationAction
          ? 'Awaiting next day…'
          : null;

    const buyPriceOverlay = buyPriceSaving ? 'Saving…' : pendingBuyPriceAction ? 'Awaiting next day…' : null;

    const buyPricingConfigOverlay = buyPricingConfigSaving
        ? 'Saving…'
        : pendingBuyPricingConfigAction
          ? 'Awaiting next day…'
          : null;

    const buyVolumeConfigOverlay = buyVolumeConfigSaving
        ? 'Saving…'
        : pendingBuyVolumeConfigAction
          ? 'Awaiting next day…'
          : null;

    const sellAutomationOverlay = sellAutomationSaving
        ? 'Saving…'
        : pendingSellAutomationAction
          ? 'Awaiting next day…'
          : null;

    const sellPriceOverlay = sellPriceSaving ? 'Saving…' : pendingSellPriceAction ? 'Awaiting next day…' : null;

    const sellPricingConfigOverlay = sellPricingConfigSaving
        ? 'Saving…'
        : pendingSellPricingConfigAction
          ? 'Awaiting next day…'
          : null;

    const sellVolumeConfigOverlay = sellVolumeConfigSaving
        ? 'Saving…'
        : pendingSellVolumeConfigAction
          ? 'Awaiting next day…'
          : null;

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
                            bid={bid}
                            local={local}
                            assets={assets}
                            overviewRow={overviewRow}
                            onLocalChange={onLocalChange}
                            onSaveBuy={handleSaveBuy}
                            onResetBuy={handleResetBuy}
                            onCancelBid={handleCancelBid}
                            onAutomationChange={handleBuyAutomationChange}
                            onSaveBuyPricingConfig={handleSaveBuyPricingConfig}
                            onResetBuyPricingConfig={handleResetBuyPricingConfig}
                            onSaveBuyVolumeConfig={handleSaveBuyVolumeConfig}
                            onResetBuyVolumeConfig={handleResetBuyVolumeConfig}
                            buyPriceSaving={buyPriceSaving}
                            buyAutomationSaving={buyAutomationSaving}
                            buyPricingConfigSaving={buyPricingConfigSaving}
                            buyVolumeConfigSaving={buyVolumeConfigSaving}
                            planetId={planetId}
                            ships={ships}
                            buyAutomationOverlay={buyAutomationOverlay}
                            buyPricingConfigOverlay={buyPricingConfigOverlay}
                            buyVolumeConfigOverlay={buyVolumeConfigOverlay}
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
                            onSaveSellPricingConfig={handleSaveSellPricingConfig}
                            onResetSellPricingConfig={handleResetSellPricingConfig}
                            onSaveSellVolumeConfig={handleSaveSellVolumeConfig}
                            onResetSellVolumeConfig={handleResetSellVolumeConfig}
                            sellPriceSaving={sellPriceSaving}
                            sellAutomationSaving={sellAutomationSaving}
                            sellPricingConfigSaving={sellPricingConfigSaving}
                            sellVolumeConfigSaving={sellVolumeConfigSaving}
                            planetId={planetId}
                            sellAutomationOverlay={sellAutomationOverlay}
                            sellPricingConfigOverlay={sellPricingConfigOverlay}
                            sellVolumeConfigOverlay={sellVolumeConfigOverlay}
                            sellPriceOverlay={sellPriceOverlay}
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
