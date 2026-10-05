'use client';

import type { Granularity } from '@/components/client/GranularityButtonGroup';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import {
    isTickerEventCategoryList,
    TICKER_EVENT_CATEGORIES,
    type TickerEventCategory,
} from '@/lib/tickerEventCategories';

export type PriceScaleMode = 'absolute' | 'relative';

function isGranularity(raw: unknown): raw is Granularity {
    return raw === 'monthly' || raw === 'yearly' || raw === 'decade';
}

function isPriceScaleMode(raw: unknown): raw is PriceScaleMode {
    return raw === 'absolute' || raw === 'relative';
}

function isBoolean(raw: unknown): raw is boolean {
    return typeof raw === 'boolean';
}

export function useGranularityPreference(): [Granularity, (granularity: Granularity) => void] {
    return useLocalStorageState<Granularity>('polyecon:ui:granularity', 'monthly', isGranularity);
}

export function usePriceScaleModePreference(): [PriceScaleMode, (mode: PriceScaleMode) => void] {
    return useLocalStorageState<PriceScaleMode>('polyecon:ui:priceScaleMode', 'absolute', isPriceScaleMode);
}

export function useBuyPricingOpenPreference(): [boolean, (open: boolean) => void] {
    return useLocalStorageState<boolean>('polyecon:ui:buyPricingOpen', false, isBoolean);
}

export function useBuyVolumeOpenPreference(): [boolean, (open: boolean) => void] {
    return useLocalStorageState<boolean>('polyecon:ui:buyVolumeOpen', false, isBoolean);
}

export function useSellPricingOpenPreference(): [boolean, (open: boolean) => void] {
    return useLocalStorageState<boolean>('polyecon:ui:sellPricingOpen', false, isBoolean);
}

export function useSellVolumeOpenPreference(): [boolean, (open: boolean) => void] {
    return useLocalStorageState<boolean>('polyecon:ui:sellVolumeOpen', false, isBoolean);
}

export function useOnlyRelevantResourcesPreference(): [boolean, (relevantOnly: boolean) => void] {
    return useLocalStorageState<boolean>('polyecon:ui:onlyRelevantResources', true, isBoolean);
}

export function useShowAllCompaniesPreference(): [boolean, (showAll: boolean) => void] {
    return useLocalStorageState<boolean>('polyecon:ui:showAllCompanies', false, isBoolean);
}

export function useHideAutomatedCompaniesPreference(): [boolean, (hideAutomated: boolean) => void] {
    return useLocalStorageState<boolean>('polyecon:ui:hideAutomatedCompanies', true, isBoolean);
}

export function useEventCategoriesPreference(): [
    TickerEventCategory[],
    (next: TickerEventCategory[] | ((prev: TickerEventCategory[]) => TickerEventCategory[])) => void,
] {
    return useLocalStorageState<TickerEventCategory[]>(
        'polyecon:ui:tickerEventCategories',
        [...TICKER_EVENT_CATEGORIES],
        isTickerEventCategoryList,
    );
}

export function useEventsHideAutomatedPreference(): [boolean, (hideAutomated: boolean) => void] {
    return useLocalStorageState<boolean>('polyecon:ui:tickerHideAutomated', false, isBoolean);
}

export function useEventsLocalPlanetOnlyPreference(): [boolean, (localPlanetOnly: boolean) => void] {
    return useLocalStorageState<boolean>('polyecon:ui:tickerLocalPlanetOnly', true, isBoolean);
}

export function useEventsShowHrCompletionPreference(): [boolean, (showHrCompletion: boolean) => void] {
    return useLocalStorageState<boolean>('polyecon:ui:tickerShowHrCompletion', true, isBoolean);
}
