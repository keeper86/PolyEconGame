'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useParams } from 'next/navigation';
import { PRICE_FLOOR } from '@/simulation/constants';
import { validateBuyBid, validateSellOffer } from '@/simulation/market/validation';
import type { ResourceAccordionItemProps } from './marketTypes';
import { TTL_FEEDBACK, MARKET_STATUS_CONFIG } from './marketTypes';
import { getResourceByName } from './marketHelpers';
import { classifyMarket } from './marketHelpers';
import { cn, formatNumbers } from '@/lib/utils';
import { MARKET_COLUMNS } from '@/app/planets/[planetId]/agent/[agentId]/market/_components/columnConfig';
import ResourceTrigger from './ResourceTrigger';
import BuySection from './BuySection';
import SellSection from './SellSection';
import MarketDetailsSection from './MarketDetailsSection';
import ProductPriceHistoryChart from './ProductPriceHistoryChart';
import { resourceNameToSlug } from './marketHelpers';

export default function ResourceAccordionItem({
    resourceName,
    agentId,
    assets,
    local,
    onLocalChange,
    _isOpen: isOpen,
    overviewRow,
    visibleColumns,
}: ResourceAccordionItemProps): React.ReactElement {
    const bid = assets.market?.buy[resourceName];
    const offer = assets.market?.sell[resourceName];
    const inventoryQty = assets.storageFacility.currentInStorage[resourceName]?.quantity ?? 0;
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    // useParams returns route params; cast to access the dynamic segment
    const { planetId } = useParams() as { planetId: string };

    // Fetch market data for the price history chart live prop (shared cache with MarketDetailsSection)
    // Only fetch when the accordion item is open to avoid batching 43 requests on initial render
    const { data: marketData } = useSimulationQuery({
        ...trpc.simulation.getPlanetMarket.queryOptions({ planetId, resourceName }),
        enabled: isOpen,
    });

    // Compute dropped columns (columns not currently visible in the table row)
    const droppedColumns = MARKET_COLUMNS.filter((col) => col.enabled && !visibleColumns.some((v) => v.id === col.id));

    // Get display value for a dropped column
    const getDroppedColumnValue = (columnId: string): React.ReactNode => {
        const marketStatus = overviewRow ? classifyMarket(overviewRow) : undefined;
        const statusConfig = marketStatus ? MARKET_STATUS_CONFIG[marketStatus] : undefined;
        switch (columnId) {
            case 'currentStorage':
                return formatNumbers(inventoryQty);
            case 'clearingPrice':
                return overviewRow ? formatNumbers(overviewRow.clearingPrice) : '—';
            case 'totalProduction':
                return overviewRow ? formatNumbers(overviewRow.totalProduction) : '—';
            case 'totalConsumption':
                return overviewRow ? formatNumbers(overviewRow.totalConsumption) : '—';
            case 'totalSupply':
                return overviewRow ? formatNumbers(overviewRow.totalSupply) : '—';
            case 'totalDemand':
                return overviewRow ? formatNumbers(overviewRow.totalDemand) : '—';
            case 'totalSold':
                return overviewRow ? formatNumbers(overviewRow.totalSold) : '—';
            case 'marketFill':
                return statusConfig ? (
                    <Badge variant='outline' className={cn('text-[9px] px-1.5 py-0 h-5', statusConfig.className)}>
                        {statusConfig.label}
                    </Badge>
                ) : (
                    '—'
                );
            default:
                return '—';
        }
    };

    const [innerOpen, setInnerOpen] = useState<string>('');

    const [buySuccessMsg, setBuySuccessMsg] = useState<string | null>(null);
    const [buyErrorMsg, setBuyErrorMsg] = useState<string | null>(null);
    const [sellSuccessMsg, setSellSuccessMsg] = useState<string | null>(null);
    const [sellErrorMsg, setSellErrorMsg] = useState<string | null>(null);
    const [showMarketDetails, setShowMarketDetails] = useState(false);

    const buySuccessTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const buyErrorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const sellSuccessTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const sellErrorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const resource = getResourceByName(resourceName);

    // Clear timeouts on unmount
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

    // Set up timeouts for clearing messages
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

    // ── Real-time validation ──────────────────────────────────────────
    useEffect(() => {
        if (!resource) {
            return;
        }

        const validationErrors: typeof local.validationErrors = {};

        // Validate sell offer price
        if (local.offerPrice !== '') {
            const offerPrice = parseFloat(local.offerPrice);
            if (!isNaN(offerPrice)) {
                const validation = validateSellOffer(offerPrice, inventoryQty);
                if (!validation.isValid) {
                    validationErrors.offerPrice = validation.error;
                }
            }
        }

        // Validate sell retainment (must be non-negative)
        if (local.offerRetainment !== '') {
            const offerRetainment = parseFloat(local.offerRetainment);
            if (!isNaN(offerRetainment) && offerRetainment < 0) {
                validationErrors.offerRetainment = 'Retainment must be non-negative';
            }
        }

        // Validate buy bid price
        if (local.bidPrice !== '') {
            const bidPrice = parseFloat(local.bidPrice);
            if (!isNaN(bidPrice)) {
                // Use validateBidFields indirectly through validateBuyBid
                const validation = validateBuyBid({ bidPrice, bidStorageTarget: undefined }, resource, assets);
                if (!validation.isValid) {
                    validationErrors.bidPrice = validation.error;
                }
            }
        }

        // Validate buy storage target (must be non-negative)
        if (local.bidStorageTarget !== '') {
            const bidStorageTarget = parseFloat(local.bidStorageTarget);
            if (!isNaN(bidStorageTarget) && bidStorageTarget < 0) {
                validationErrors.bidStorageTarget = 'Storage target must be non-negative';
            }
        }

        // Update validation errors if they changed
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

    // ── Mutations ──────────────────────────────────────────────────────
    const sellMutation = useMutation(
        trpc.setSellOffers.mutationOptions({
            onSuccess: () => {
                setSellSuccessMsg('Sell offers saved. Changes take effect on the next market tick.');
                setSellErrorMsg(null);
                void queryClient.invalidateQueries({ queryKey: trpc.simulation.getAgentPlanetDetail.queryKey() });
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
                void queryClient.invalidateQueries({ queryKey: trpc.simulation.getAgentPlanetDetail.queryKey() });
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
                void queryClient.invalidateQueries({ queryKey: trpc.simulation.getAgentPlanetDetail.queryKey() });
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
                void queryClient.invalidateQueries({ queryKey: trpc.simulation.getAgentPlanetDetail.queryKey() });
            },
            onError: (err) => {
                setBuyErrorMsg(err instanceof Error ? err.message : 'Failed to cancel bid');
                setBuySuccessMsg(null);
            },
        }),
    );

    const buySaving = buyMutation.isPending || cancelBuyBidMutation.isPending;
    const sellSaving = sellMutation.isPending || cancelSellOfferMutation.isPending;

    // ── Buy save handler ──────────────────────────────────────────────
    const handleSaveBuy = () => {
        setBuySuccessMsg(null);
        setBuyErrorMsg(null);

        if (!resource) {
            setBuyErrorMsg(`Unknown resource: ${resourceName}`);
            return;
        }

        const bidPrice = parseFloat(local.bidPrice);
        const bidStorageTarget = parseFloat(local.bidStorageTarget);

        // Validate bid price and effective quantity against deposits and storage capacity.
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

    // ── Sell save handler ──────────────────────────────────────────────
    const handleSaveSell = () => {
        setSellSuccessMsg(null);
        setSellErrorMsg(null);

        if (!resource) {
            setSellErrorMsg(`Unknown resource: ${resourceName}`);
            return;
        }

        const offerPrice = parseFloat(local.offerPrice);
        const offerRetainment = parseFloat(local.offerRetainment);

        // Validate sell price only (retainment just needs to be ≥ 0)
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

    // ── Reset handlers ────────────────────────────────────────────────
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

    // ── Automation change handlers ────────────────────────────────────
    const handleBuyAutomationChange = (automated: boolean) => {
        onLocalChange(resourceName, { bidAutomated: automated, savedBidAutomated: automated });
        if (automated) {
            setInnerOpen((prev) => (prev === 'buy' ? '' : prev));
        }
        const buyPayload: Record<string, { automated?: boolean }> = {
            [resourceName]: { automated },
        };
        buyMutation.mutate({ agentId, planetId, bids: buyPayload });
    };

    const handleSellAutomationChange = (automated: boolean) => {
        onLocalChange(resourceName, { offerAutomated: automated, savedOfferAutomated: automated });
        if (automated) {
            setInnerOpen((prev) => (prev === 'sell' ? '' : prev));
        }
        const sellPayload: Record<string, { automated?: boolean }> = {
            [resourceName]: { automated },
        };
        sellMutation.mutate({ agentId, planetId, offers: sellPayload });
    };

    return (
        <AccordionItem value={resourceName} id={resourceNameToSlug(resourceName)}>
            <AccordionTrigger className='hover:no-underline px-1'>
                <ResourceTrigger
                    name={resourceName}
                    bid={bid}
                    offer={offer}
                    overviewRow={overviewRow}
                    storageQuantity={inventoryQty}
                    visibleColumns={visibleColumns}
                />
            </AccordionTrigger>
            <AccordionContent>
                <div className='px-1 pb-2 space-y-4'>
                    {/* ── Dropped columns summary grid ── */}
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

                    {/* ── Price history chart ── */}
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
                                  }
                                : undefined
                        }
                    />

                    {/* ── Buy / Sell inner accordion ── */}
                    <Accordion
                        type='single'
                        collapsible
                        className='space-y-1'
                        value={innerOpen}
                        onValueChange={setInnerOpen}
                    >
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
                            buySaving={buySaving}
                            buySuccessMsg={buySuccessMsg}
                            buyErrorMsg={buyErrorMsg}
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
                            sellSaving={sellSaving}
                            sellSuccessMsg={sellSuccessMsg}
                            sellErrorMsg={sellErrorMsg}
                        />
                    </Accordion>

                    {/* ── Market details toggle ── */}
                    <div className='flex items-center justify-between gap-3 pt-2'>
                        <button
                            onClick={() => setShowMarketDetails(!showMarketDetails)}
                            className='flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors'
                        >
                            {showMarketDetails ? (
                                <ChevronUp className='h-3.5 w-3.5' />
                            ) : (
                                <ChevronDown className='h-3.5 w-3.5' />
                            )}
                            <span>Market details</span>
                        </button>
                    </div>

                    {/* ── Market details content ── */}
                    {showMarketDetails && <MarketDetailsSection planetId={planetId} resourceName={resourceName} />}
                </div>
            </AccordionContent>
        </AccordionItem>
    );
}
