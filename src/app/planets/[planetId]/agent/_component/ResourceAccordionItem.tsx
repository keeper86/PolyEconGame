'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useParams } from 'next/navigation';
import { FOOD_PRICE_FLOOR } from '@/simulation/constants';
import { validateBuyBid, validateSellOffer } from '@/simulation/market/validation';
import type { ResourceAccordionItemProps } from '../[agentId]/market/_components/marketTypes';
import { TTL_FEEDBACK } from '../[agentId]/market/_components/marketTypes';
import { getResourceByName } from '../[agentId]/market/_components/marketHelpers';
import ResourceTrigger from '../[agentId]/market/_components/ResourceTrigger';
import BuySection from '../[agentId]/market/_components/BuySection';
import SellSection from '../[agentId]/market/_components/SellSection';
import MarketDetailsSection from '../[agentId]/market/_components/MarketDetailsSection';

export default function ResourceAccordionItem({
    resourceName,
    agentId,
    assets,
    local,
    onLocalChange,
    _isOpen,
    overviewRow,
}: ResourceAccordionItemProps): React.ReactElement {
    const bid = assets.market?.buy[resourceName];
    const offer = assets.market?.sell[resourceName];
    const inventoryQty = assets.storageFacility.currentInStorage[resourceName]?.quantity ?? 0;
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    // useParams returns route params; cast to access the dynamic segment
    const { planetId } = useParams() as { planetId: string };

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

    const buySaving = buyMutation.isPending;
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

        const buyPayload: Record<string, { bidPrice?: number; bidStorageTarget?: number; automated?: boolean }> = {
            [resourceName]: {
                ...(local.bidAutomated !== (bid?.automated ?? false) && { automated: local.bidAutomated }),
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
            const validation = validateSellOffer(!isNaN(offerPrice) ? offerPrice : undefined, undefined, inventoryQty);
            if (!validation.isValid) {
                setSellErrorMsg(`Sell validation failed: ${validation.error}`);
                return;
            }
        }

        const sellPayload: Record<string, { offerPrice?: number; offerRetainment?: number; automated?: boolean }> = {
            [resourceName]: {
                ...(local.offerAutomated !== (offer?.automated ?? false) && { automated: local.offerAutomated }),
                ...(!isNaN(offerPrice) && offerPrice >= FOOD_PRICE_FLOOR && { offerPrice }),
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
            bidAutomated: local.savedBidAutomated,
        });
        setBuySuccessMsg(null);
        setBuyErrorMsg(null);
    };

    const handleResetSell = () => {
        onLocalChange(resourceName, {
            offerPrice: local.savedOfferPrice,
            offerRetainment: local.savedOfferRetainment,
            offerAutomated: local.savedOfferAutomated,
        });
        setSellSuccessMsg(null);
        setSellErrorMsg(null);
    };

    // ── Automation change handlers ────────────────────────────────────
    const handleBuyAutomationChange = (automated: boolean) => {
        onLocalChange(resourceName, { bidAutomated: automated });
        // Auto-save when automation is toggled
        if (automated !== local.savedBidAutomated) {
            const buyPayload: Record<string, { automated?: boolean }> = {
                [resourceName]: { automated },
            };
            buyMutation.mutate({ agentId, planetId, bids: buyPayload });
        }
    };

    const handleSellAutomationChange = (automated: boolean) => {
        onLocalChange(resourceName, { offerAutomated: automated });
        // Auto-save when automation is toggled
        if (automated !== local.savedOfferAutomated) {
            const sellPayload: Record<string, { automated?: boolean }> = {
                [resourceName]: { automated },
            };
            sellMutation.mutate({ agentId, planetId, offers: sellPayload });
        }
    };

    return (
        <AccordionItem value={resourceName}>
            <AccordionTrigger className='hover:no-underline px-1'>
                <ResourceTrigger name={resourceName} bid={bid} offer={offer} overviewRow={overviewRow} />
            </AccordionTrigger>
            <AccordionContent>
                <div className='px-1 pb-2 space-y-5'>
                    <BuySection
                        resourceName={resourceName}
                        bid={bid}
                        local={local}
                        assets={assets}
                        overviewRow={overviewRow}
                        onLocalChange={onLocalChange}
                        onSaveBuy={handleSaveBuy}
                        onResetBuy={handleResetBuy}
                        onAutomationChange={handleBuyAutomationChange}
                        buySaving={buySaving}
                        buySuccessMsg={buySuccessMsg}
                        buyErrorMsg={buyErrorMsg}
                    />

                    <div className='border-t' />

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
