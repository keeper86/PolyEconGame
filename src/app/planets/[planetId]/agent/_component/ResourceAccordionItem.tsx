'use client';

import React, { useState } from 'react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useParams } from 'next/navigation';
import { FOOD_PRICE_FLOOR } from '@/simulation/constants';
import { validateBuyBid, validateSellOffer } from '@/simulation/market/validation';
import type { ResourceAccordionItemProps } from './marketTypes';
import { getResourceByName } from './marketHelpers';
import ResourceTrigger from './ResourceTrigger';
import BuySection from './BuySection';
import SellSection from './SellSection';
import MarketDetailsSection from './MarketDetailsSection';

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

    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showMarketDetails, setShowMarketDetails] = useState(false);

    const resource = getResourceByName(resourceName);

    // ── Mutations ──────────────────────────────────────────────────────
    const sellMutation = useMutation(
        trpc.setSellOffers.mutationOptions({
            onSuccess: () => {
                setSuccessMsg('Saved. Changes take effect on the next tick.');
                setErrorMsg(null);
                void queryClient.invalidateQueries({ queryKey: trpc.simulation.getAgentPlanetDetail.queryKey() });
            },
            onError: (err) => {
                setErrorMsg(err instanceof Error ? err.message : 'Failed to save');
                setSuccessMsg(null);
            },
        }),
    );

    const buyMutation = useMutation(
        trpc.setBuyBids.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({ queryKey: trpc.simulation.getAgentPlanetDetail.queryKey() });
            },
        }),
    );

    const saving = sellMutation.isPending || buyMutation.isPending;

    // ── Validation + save ──────────────────────────────────────────────
    const handleSave = () => {
        setSuccessMsg(null);
        setErrorMsg(null);

        if (!resource) {
            setErrorMsg(`Unknown resource: ${resourceName}`);
            return;
        }

        const offerPrice = parseFloat(local.offerPrice);
        const offerRetainment = parseFloat(local.offerRetainment);
        const bidPrice = parseFloat(local.bidPrice);
        const bidStorageTarget = parseFloat(local.bidStorageTarget);

        // Validate sell price only (retainment just needs to be ≥ 0)
        if (!isNaN(offerPrice)) {
            const validation = validateSellOffer(!isNaN(offerPrice) ? offerPrice : undefined, undefined, inventoryQty);
            if (!validation.isValid) {
                setErrorMsg(`Sell validation failed: ${validation.error}`);
                return;
            }
        }

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
                setErrorMsg(`Buy validation failed: ${errorText}`);
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

        const buyPayload: Record<string, { bidPrice?: number; bidStorageTarget?: number; automated?: boolean }> = {
            [resourceName]: {
                ...(local.bidAutomated !== (bid?.automated ?? false) && { automated: local.bidAutomated }),
                ...(!isNaN(bidPrice) && bidPrice > 0 && { bidPrice }),
                ...(!isNaN(bidStorageTarget) && bidStorageTarget >= 0 && { bidStorageTarget }),
            },
        };

        sellMutation.mutate({ agentId, planetId, offers: sellPayload });
        buyMutation.mutate({ agentId, planetId, bids: buyPayload });
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
                        saving={saving}
                    />

                    <div className='border-t' />

                    <SellSection
                        resourceName={resourceName}
                        offer={offer}
                        local={local}
                        assets={assets}
                        overviewRow={overviewRow}
                        onLocalChange={onLocalChange}
                        saving={saving}
                    />

                    {/* ── Save button + feedback + market details toggle in same row ── */}
                    <div className='flex items-center justify-between gap-3'>
                        <div className='flex items-center gap-3'>
                            <div>
                                {successMsg && (
                                    <span className='text-xs text-green-600 dark:text-green-400 flex items-center gap-1'>
                                        <CheckCircle2 className='h-3.5 w-3.5' /> {successMsg}
                                    </span>
                                )}
                                {errorMsg && (
                                    <span className='text-xs text-destructive flex items-center gap-1'>
                                        <AlertCircle className='h-3.5 w-3.5' />
                                        <span dangerouslySetInnerHTML={{ __html: errorMsg }} />
                                    </span>
                                )}
                            </div>
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
                        <Button size='sm' onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                    </div>

                    {/* ── Market details content ── */}
                    {showMarketDetails && <MarketDetailsSection planetId={planetId} resourceName={resourceName} />}
                </div>
            </AccordionContent>
        </AccordionItem>
    );
}
