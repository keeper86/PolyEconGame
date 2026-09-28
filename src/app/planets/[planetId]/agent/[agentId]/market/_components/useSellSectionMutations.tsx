'use client';

import { useAddPendingAction, usePendingActions } from '@/hooks/useActionOverlay';
import { useTRPC } from '@/lib/trpc';
import { PRICE_FLOOR } from '@/simulation/constants';
import { validateSellOffer } from '@/simulation/market/validation';
import { queryStorageFacility } from '@/simulation/planet/facility';
import type { AgentPlanetAssets, AutomatedPricingConfig } from '@/simulation/planet/planet';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { getResourceByName } from './marketHelpers';
import { termFor } from '@/i18n/terms';
import { readDomainError, useErrorMessage } from '@/i18n/errors';
import type { AutoConfigLocalState, LocalResourceState, MarketOfferEntry } from './marketTypes';
import { localToAutoConfig, SELL_PRICING_KEYS, SELL_VOLUME_KEYS } from './marketTypes';

type ToastTranslator = ReturnType<typeof useTranslations<'Toasts'>>;

function depositWarning(t: ToastTranslator, message: string, agentId: string, planetId: string) {
    return (
        <span>
            {message}. {t('depositBorrowPrefix')}
            <a
                href={`/planets/${planetId}/agent/${agentId}/financial`}
                className='underline font-medium hover:text-blue-700'
            >
                {t('depositBorrowLink')}
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
    const keySet = new Set<string>(SELL_PRICING_KEYS);
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
    const keySet = new Set<string>(SELL_VOLUME_KEYS);
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
    const t = useTranslations('Toasts');
    const tErrors = useTranslations('Errors');
    const locale = useLocale();
    const showError = useErrorMessage();
    const resource = getResourceByName(resourceName);
    const inventoryQty = queryStorageFacility(assets.storage, resourceName);

    const reportError = (err: unknown, fallback: string) => {
        const message = err instanceof Error ? showError(err) : fallback;
        if (readDomainError(err)?.code === 'insufficientDeposits') {
            toast.error(depositWarning(t, message, agentId, planetId));
        } else {
            toast.error(message);
        }
    };

    const sellMutation = useMutation(
        trpc.setSellOffers.mutationOptions({
            onError: (err) => reportError(err, t('updateSellOffersFailed')),
        }),
    );

    const sellPricingMutation = useMutation(
        trpc.setSellOffers.mutationOptions({
            onError: (err) => reportError(err, t('updateSellOffersFailed')),
        }),
    );

    const sellVolumeMutation = useMutation(
        trpc.setSellOffers.mutationOptions({
            onError: (err) => reportError(err, t('updateSellOffersFailed')),
        }),
    );

    const [sellPriceSaving, setSellPriceSaving] = useState(false);
    const [sellAutomationSaving, setSellAutomationSaving] = useState(false);
    const [sellPricingConfigSaving, setSellPricingConfigSaving] = useState(false);
    const [sellVolumeConfigSaving, setSellVolumeConfigSaving] = useState(false);

    const handleSaveSell = () => {
        if (!resource) {
            toast.error(tErrors('unknownResource', { resourceName: termFor(locale, resourceName) }));
            return;
        }

        const offerPrice = parseFloat(local.offerPrice);

        if (!isNaN(offerPrice)) {
            const validation = validateSellOffer(offerPrice, inventoryQty);
            if (!validation.isValid) {
                toast.error(`${t('sellValidationFailedPrefix')}${tErrors(validation.code, validation.params)}`);
                return;
            }
        }

        if (isNaN(offerPrice) || offerPrice < PRICE_FLOOR) {
            toast.error(t('invalidOfferPrice'));
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
                    toast.success(t('sellOffersSaved'));
                },
                onError: () => setSellAutomationSaving(false),
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
                    toast.success(t('pricingConfigSaved'));
                },
                onError: () => setSellPricingConfigSaving(false),
            },
        );
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
                    toast.success(t('volumeConfigSaved'));
                },
                onError: () => setSellVolumeConfigSaving(false),
            },
        );
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
        ? t('saving')
        : pendingSellAutomationAction
          ? t('awaitingNextDay')
          : null;

    const sellPriceOverlay = sellPriceSaving ? t('saving') : pendingSellPriceAction ? t('awaitingNextDay') : null;

    const sellPricingConfigOverlay = sellPricingConfigSaving
        ? t('saving')
        : pendingSellPricingConfigAction
          ? t('awaitingNextDay')
          : null;

    const sellVolumeConfigOverlay = sellVolumeConfigSaving
        ? t('saving')
        : pendingSellVolumeConfigAction
          ? t('awaitingNextDay')
          : null;

    return {
        saveSell: handleSaveSell,
        resetSell: handleResetSell,
        automationChange: handleSellAutomationChange,
        savePricingConfig: handleSaveSellPricingConfig,
        saveVolumeConfig: handleSaveSellVolumeConfig,
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
