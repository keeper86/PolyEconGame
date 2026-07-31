'use client';

import { useTour } from '@/components/tour/TourContext';
import { useAddPendingAction, usePendingActions } from '@/hooks/useActionOverlay';
import { useTRPC } from '@/lib/trpc';
import { validateBuyBid } from '@/simulation/market/validation';
import type { AgentPlanetAssets, AutomatedPricingConfig } from '@/simulation/planet/planet';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { getResourceByName } from './marketHelpers';
import type { AutoConfigLocalState, LocalResourceState, MarketBidEntry } from './marketTypes';
import { localToAutoConfig } from './marketTypes';

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

function depositWarning(message: string, agentId: string, planetId: string) {
    return (
        <span>
            {message}. You can borrow funds on the{' '}
            <a
                href={`/planets/${planetId}/agent/${agentId}/financial`}
                className='underline font-medium hover:text-blue-700'
            >
                Financial page
            </a>
            .
        </span>
    );
}

function pickAutoConfigKeys(source: AutoConfigLocalState, keys: readonly string[]) {
    const result: Record<string, string> = {};
    for (const k of keys) {
        result[k] = source[k as keyof AutoConfigLocalState];
    }
    return result;
}

function commitPricingConfig(autoConfig: AutomatedPricingConfig | undefined): AutomatedPricingConfig | undefined {
    const keySet = new Set<string>(BUY_PRICING_KEYS as readonly string[]);
    const filtered: Record<string, number> = {};
    if (autoConfig) {
        for (const [k, v] of Object.entries(autoConfig)) {
            if (keySet.has(k)) {
                filtered[k] = v;
            }
        }
    }
    return Object.keys(filtered).length > 0 ? (filtered as AutomatedPricingConfig) : undefined;
}

function commitVolumeConfig(autoConfig: AutomatedPricingConfig | undefined): AutomatedPricingConfig | undefined {
    const keySet = new Set<string>(BUY_VOLUME_KEYS as readonly string[]);
    const filtered: Record<string, number> = {};
    if (autoConfig) {
        for (const [k, v] of Object.entries(autoConfig)) {
            if (keySet.has(k)) {
                filtered[k] = v;
            }
        }
    }
    return Object.keys(filtered).length > 0 ? (filtered as AutomatedPricingConfig) : undefined;
}

type UseBuySectionMutationsArgs = {
    agentId: string;
    planetId: string;
    resourceName: string;
    local: LocalResourceState;
    onLocalChange: (name: string, patch: Partial<LocalResourceState>) => void;
    assets: AgentPlanetAssets;
    bid?: MarketBidEntry;
};

export function useBuySectionMutations({
    agentId,
    planetId,
    resourceName,
    local,
    onLocalChange,
    assets,
    bid,
}: UseBuySectionMutationsArgs) {
    const trpc = useTRPC();
    const addPending = useAddPendingAction();
    const pendingActions = usePendingActions(agentId, planetId);
    const { isTourActive: marketIsTourActive, markActionCompleted: marketMarkActionCompleted } = useTour();
    const resource = getResourceByName(resourceName);

    const buyMutation = useMutation(
        trpc.setBuyBids.mutationOptions({
            onError: (err) => {
                const errorMessage = err instanceof Error ? err.message : 'Failed to update buy bids';
                if (errorMessage.includes('Insufficient deposits')) {
                    toast.error(depositWarning(errorMessage, agentId, planetId));
                } else {
                    toast.error(errorMessage);
                }
            },
        }),
    );

    const buyPricingMutation = useMutation(
        trpc.setBuyBids.mutationOptions({
            onError: (err) => {
                const errorMessage = err instanceof Error ? err.message : 'Failed to update buy bids';
                if (errorMessage.includes('Insufficient deposits')) {
                    toast.error(depositWarning(errorMessage, agentId, planetId));
                } else {
                    toast.error(errorMessage);
                }
            },
        }),
    );

    const buyVolumeMutation = useMutation(
        trpc.setBuyBids.mutationOptions({
            onError: (err) => {
                const errorMessage = err instanceof Error ? err.message : 'Failed to update buy bids';
                if (errorMessage.includes('Insufficient deposits')) {
                    toast.error(depositWarning(errorMessage, agentId, planetId));
                } else {
                    toast.error(errorMessage);
                }
            },
        }),
    );

    const [buyPriceSaving, setBuyPriceSaving] = useState(false);
    const [buyAutomationSaving, setBuyAutomationSaving] = useState(false);
    const [buyPricingConfigSaving, setBuyPricingConfigSaving] = useState(false);
    const [buyVolumeConfigSaving, setBuyVolumeConfigSaving] = useState(false);

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
                    toast.error(<span>Buy validation failed: {depositWarning(errorText, agentId, planetId)}</span>);
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

    const handleResetBuy = () => {
        onLocalChange(resourceName, {
            bidPrice: local.savedBidPrice,
        });
    };

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
                        toast.error(depositWarning(errorMessage, agentId, planetId));
                    } else {
                        toast.error(errorMessage);
                    }
                },
            },
        );
    };

    const handleSaveBuyPricingConfig = () => {
        const autoConfig = localToAutoConfig(
            pickAutoConfigKeys(local.buyAutoConfig, BUY_PRICING_KEYS) as AutoConfigLocalState,
        );
        const mergedWithCommitted = { ...(bid?.autoConfig ?? {}), ...(autoConfig ?? {}) };
        const filtered = commitPricingConfig(mergedWithCommitted);
        const buyPayload: Record<string, { autoConfig?: AutomatedPricingConfig }> = {
            [resourceName]: { autoConfig: filtered },
        };

        setBuyPricingConfigSaving(true);
        buyPricingMutation.mutate(
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
        onLocalChange(resourceName, { buyAutoConfig: { ...current, ...resetFields } as AutoConfigLocalState });
    };

    const handleSaveBuyVolumeConfig = () => {
        const autoConfig = localToAutoConfig(
            pickAutoConfigKeys(local.buyAutoConfig, BUY_VOLUME_KEYS) as AutoConfigLocalState,
        );
        const mergedWithCommitted = { ...(bid?.autoConfig ?? {}), ...(autoConfig ?? {}) };
        const filtered = commitVolumeConfig(mergedWithCommitted);
        const buyPayload: Record<string, { autoConfig?: AutomatedPricingConfig }> = {
            [resourceName]: { autoConfig: filtered },
        };

        setBuyVolumeConfigSaving(true);
        buyVolumeMutation.mutate(
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
        onLocalChange(resourceName, { buyAutoConfig: { ...current, ...resetFields } as AutoConfigLocalState });
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

    return {
        saveBuy: handleSaveBuy,
        resetBuy: handleResetBuy,
        automationChange: handleBuyAutomationChange,
        savePricingConfig: handleSaveBuyPricingConfig,
        resetPricingConfig: handleResetBuyPricingConfig,
        saveVolumeConfig: handleSaveBuyVolumeConfig,
        resetVolumeConfig: handleResetBuyVolumeConfig,
        buyPriceSaving,
        buyAutomationSaving,
        buyPricingConfigSaving,
        buyVolumeConfigSaving,
        buyPriceOverlay,
        buyAutomationOverlay,
        buyPricingConfigOverlay,
        buyVolumeConfigOverlay,
    };
}
