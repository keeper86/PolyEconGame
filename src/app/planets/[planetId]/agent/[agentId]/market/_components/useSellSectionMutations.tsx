'use client';

import { useAddPendingAction, usePendingActions } from '@/hooks/useActionOverlay';
import { useTRPC } from '@/lib/trpc';
import { PRICE_FLOOR } from '@/simulation/constants';
import { validateSellOffer } from '@/simulation/market/validation';
import type { AgentPlanetAssets, AutomatedPricingConfig } from '@/simulation/planet/planet';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { getResourceByName } from './marketHelpers';
import type { AutoConfigLocalState, LocalResourceState, MarketOfferEntry } from './marketTypes';
import { localToAutoConfig } from './marketTypes';

const SELL_PRICING_KEYS = [
    'priceAdjustMaxUp',
    'priceAdjustMaxDown',
    'automatedCostFloorBuffer',
    'targetSellThrough',
] as const;
const SELL_VOLUME_KEYS = ['freeRetainment', 'freeRetainmentSmoothingMaxExtra'] as const;

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
    const keySet = new Set<string>(SELL_PRICING_KEYS as readonly string[]);
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
    const keySet = new Set<string>(SELL_VOLUME_KEYS as readonly string[]);
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

type UseSellSectionMutationsArgs = {
    agentId: string;
    planetId: string;
    resourceName: string;
    local: LocalResourceState;
    onLocalChange: (name: string, patch: Partial<LocalResourceState>) => void;
    assets: AgentPlanetAssets;
    offer?: MarketOfferEntry;
};

export function useSellSectionMutations({
    agentId,
    planetId,
    resourceName,
    local,
    onLocalChange,
    assets,
    offer,
}: UseSellSectionMutationsArgs) {
    const trpc = useTRPC();
    const addPending = useAddPendingAction();
    const pendingActions = usePendingActions(agentId, planetId);
    const resource = getResourceByName(resourceName);
    const inventoryQty = assets.storageFacility.currentInStorage[resourceName]?.quantity ?? 0;

    const sellMutation = useMutation(
        trpc.setSellOffers.mutationOptions({
            onError: (err) => {
                const errorMessage = err instanceof Error ? err.message : 'Failed to update sell offers';
                if (errorMessage.includes('Insufficient deposits')) {
                    toast.error(depositWarning(errorMessage, agentId, planetId));
                } else {
                    toast.error(errorMessage);
                }
            },
        }),
    );

    const sellPricingMutation = useMutation(
        trpc.setSellOffers.mutationOptions({
            onError: (err) => {
                const errorMessage = err instanceof Error ? err.message : 'Failed to update sell offers';
                if (errorMessage.includes('Insufficient deposits')) {
                    toast.error(depositWarning(errorMessage, agentId, planetId));
                } else {
                    toast.error(errorMessage);
                }
            },
        }),
    );

    const sellVolumeMutation = useMutation(
        trpc.setSellOffers.mutationOptions({
            onError: (err) => {
                const errorMessage = err instanceof Error ? err.message : 'Failed to update sell offers';
                if (errorMessage.includes('Insufficient deposits')) {
                    toast.error(depositWarning(errorMessage, agentId, planetId));
                } else {
                    toast.error(errorMessage);
                }
            },
        }),
    );

    const [sellPriceSaving, setSellPriceSaving] = useState(false);
    const [sellAutomationSaving, setSellAutomationSaving] = useState(false);
    const [sellPricingConfigSaving, setSellPricingConfigSaving] = useState(false);
    const [sellVolumeConfigSaving, setSellVolumeConfigSaving] = useState(false);

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

    const handleResetSell = () => {
        onLocalChange(resourceName, {
            offerPrice: local.savedOfferPrice,
        });
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
                        toast.error(depositWarning(errorMessage, agentId, planetId));
                    } else {
                        toast.error(errorMessage);
                    }
                },
            },
        );
    };

    const handleSaveSellPricingConfig = () => {
        const autoConfig = localToAutoConfig(
            pickAutoConfigKeys(local.sellAutoConfig, SELL_PRICING_KEYS) as AutoConfigLocalState,
        );
        const mergedWithCommitted = { ...(offer?.autoConfig ?? {}), ...(autoConfig ?? {}) };
        const filtered = commitPricingConfig(mergedWithCommitted);
        const sellPayload: Record<string, { autoConfig?: AutomatedPricingConfig }> = {
            [resourceName]: { autoConfig: filtered },
        };

        setSellPricingConfigSaving(true);
        sellPricingMutation.mutate(
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
        onLocalChange(resourceName, { sellAutoConfig: { ...current, ...resetFields } as AutoConfigLocalState });
    };

    const handleSaveSellVolumeConfig = () => {
        const autoConfig = localToAutoConfig(
            pickAutoConfigKeys(local.sellAutoConfig, SELL_VOLUME_KEYS) as AutoConfigLocalState,
        );
        const mergedWithCommitted = { ...(offer?.autoConfig ?? {}), ...(autoConfig ?? {}) };
        const filtered = commitVolumeConfig(mergedWithCommitted);
        const sellPayload: Record<string, { autoConfig?: AutomatedPricingConfig }> = {
            [resourceName]: { autoConfig: filtered },
        };

        setSellVolumeConfigSaving(true);
        sellVolumeMutation.mutate(
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
        onLocalChange(resourceName, { sellAutoConfig: { ...current, ...resetFields } as AutoConfigLocalState });
    };

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

    return {
        saveSell: handleSaveSell,
        resetSell: handleResetSell,
        automationChange: handleSellAutomationChange,
        savePricingConfig: handleSaveSellPricingConfig,
        resetPricingConfig: handleResetSellPricingConfig,
        saveVolumeConfig: handleSaveSellVolumeConfig,
        resetVolumeConfig: handleResetSellVolumeConfig,
        sellPriceSaving,
        sellAutomationSaving,
        sellPricingConfigSaving,
        sellVolumeConfigSaving,
        sellPriceOverlay,
        sellAutomationOverlay,
        sellPricingConfigOverlay,
        sellVolumeConfigOverlay,
    };
}
