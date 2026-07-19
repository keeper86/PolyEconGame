import type { MarketOverviewRow } from '@/server/controller/planet';
import type { ConsumptionShipInfo } from '@/simulation/market/consumptionShipInfo';
import type {
    AgentPlanetAssets,
    AutomatedPricingConfig,
    SellDiagnostics,
    BuyDiagnostics,
} from '@/simulation/planet/planet';

export const TTL_FEEDBACK = 5_000;

export type AutoConfigLocalState = {
    priceAdjustMaxUp: string;
    priceAdjustMaxDown: string;
    costSpringStrength: string;
    bidOfferMaxCostMultiplier: string;
    inventorySmoothingMaxExtra: string;
    outputBufferMaxTicks: string;
    targetSellThrough: string;
    automatedCostFloorBuffer: string;
    inputBufferTargetTicks: string;
    targetFillRate: string;
    freeBuyQuantity: string;
    freeSellQuantity: string;
    freeBuyQuantitySmoothingMaxExtra: string;
    freeSellQuantitySmoothingMaxExtra: string;
};

export function autoConfigToLocal(config: AutomatedPricingConfig | undefined): AutoConfigLocalState {
    return {
        priceAdjustMaxUp: config?.priceAdjustMaxUp?.toString() ?? '',
        priceAdjustMaxDown: config?.priceAdjustMaxDown?.toString() ?? '',
        costSpringStrength: config?.costSpringStrength?.toString() ?? '',
        bidOfferMaxCostMultiplier: config?.bidOfferMaxCostMultiplier?.toString() ?? '',
        inventorySmoothingMaxExtra: config?.inventorySmoothingMaxExtra?.toString() ?? '',
        outputBufferMaxTicks: config?.outputBufferMaxTicks?.toString() ?? '',
        targetSellThrough: config?.targetSellThrough?.toString() ?? '',
        automatedCostFloorBuffer: config?.automatedCostFloorBuffer?.toString() ?? '',
        inputBufferTargetTicks: config?.inputBufferTargetTicks?.toString() ?? '',
        targetFillRate: config?.targetFillRate?.toString() ?? '',
        freeBuyQuantity: config?.freeBuyQuantity?.toString() ?? '',
        freeSellQuantity: config?.freeSellQuantity?.toString() ?? '',
        freeBuyQuantitySmoothingMaxExtra: config?.freeBuyQuantitySmoothingMaxExtra?.toString() ?? '',
        freeSellQuantitySmoothingMaxExtra: config?.freeSellQuantitySmoothingMaxExtra?.toString() ?? '',
    };
}

export function localToAutoConfig(local: AutoConfigLocalState): AutomatedPricingConfig | undefined {
    const parsed: Record<string, number | undefined> = {};
    const keys: (keyof AutoConfigLocalState)[] = [
        'priceAdjustMaxUp',
        'priceAdjustMaxDown',
        'costSpringStrength',
        'bidOfferMaxCostMultiplier',
        'inventorySmoothingMaxExtra',
        'outputBufferMaxTicks',
        'targetSellThrough',
        'automatedCostFloorBuffer',
        'inputBufferTargetTicks',
        'targetFillRate',
        'freeBuyQuantity',
        'freeSellQuantity',
        'freeBuyQuantitySmoothingMaxExtra',
        'freeSellQuantitySmoothingMaxExtra',
    ];
    let hasAny = false;
    for (const key of keys) {
        const v = local[key] !== '' ? parseFloat(local[key]) : undefined;
        if (v !== undefined && !isNaN(v)) {
            parsed[key] = v;
            hasAny = true;
        }
    }
    return hasAny ? (parsed as AutomatedPricingConfig) : undefined;
}

export function isAutoConfigDirty(local: AutoConfigLocalState, committed: AutomatedPricingConfig | undefined): boolean {
    const resolvedCommitted = committed ?? {};
    const keys: (keyof AutoConfigLocalState)[] = [
        'priceAdjustMaxUp',
        'priceAdjustMaxDown',
        'costSpringStrength',
        'bidOfferMaxCostMultiplier',
        'inventorySmoothingMaxExtra',
        'outputBufferMaxTicks',
        'targetSellThrough',
        'automatedCostFloorBuffer',
        'inputBufferTargetTicks',
        'targetFillRate',
        'freeBuyQuantity',
        'freeSellQuantity',
        'freeBuyQuantitySmoothingMaxExtra',
        'freeSellQuantitySmoothingMaxExtra',
    ];
    for (const key of keys) {
        const localVal = local[key] !== '' ? parseFloat(local[key]) : undefined;
        const committedVal = resolvedCommitted[key as keyof AutomatedPricingConfig];
        if (localVal !== committedVal && localVal !== undefined) {
            return true;
        }
    }
    return false;
}

export type MarketBidEntry = {
    bidPrice?: number;
    bidStorageTarget?: number;
    lastBought?: number;
    lastSpent?: number;
    storageFullWarning?: boolean;
    depositScaleWarning?: 'scaled' | 'dropped';
    storageScaleWarning?: 'scaled' | 'dropped';
    automated?: boolean;
    autoConfig?: AutomatedPricingConfig;
    diagnostics?: BuyDiagnostics;
};

export type MarketOfferEntry = {
    offerPrice?: number;
    offerRetainment?: number;
    lastSold?: number;
    lastRevenue?: number;
    priceDirection?: number;
    automated?: boolean;
    autoConfig?: AutomatedPricingConfig;
    diagnostics?: SellDiagnostics;
};

export type LocalResourceState = {
    offerPrice: string;

    offerRetainment: string;
    offerAutomated: boolean;
    bidPrice: string;

    bidStorageTarget: string;
    bidAutomated: boolean;

    targetBufferTicks: string;

    buyAutoConfig: AutoConfigLocalState;
    sellAutoConfig: AutoConfigLocalState;

    dirtyFields: {
        offerPrice: boolean;
        offerRetainment: boolean;
        bidPrice: boolean;
        bidStorageTarget: boolean;
    };

    validationErrors: {
        offerPrice?: string;
        offerRetainment?: string;
        bidPrice?: string;
        bidStorageTarget?: string;
    };

    savedOfferPrice: string;
    savedOfferRetainment: string;
    savedOfferAutomated: boolean;
    savedBidPrice: string;
    savedBidStorageTarget: string;
    savedBidAutomated: boolean;
};

export type Props = {
    agentId: string;
    planetId: string;
    assets: AgentPlanetAssets;
    showAll: boolean;
    allPlanetDeposits?: Record<string, number>;
    ships: ConsumptionShipInfo[];
};

export const BANDS_FOR_RATIO_CLEARING_PRICE_TO_PRODUCTION_COST = [
    { limit: 0.85, label: 'depressed', className: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30' },
    {
        limit: 0.95,
        label: 'lossy',
        className: 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30',
    },
    {
        limit: 1.3333,
        label: 'marginal',
        className: 'bg-lime-500/20 text-lime-700 dark:text-lime-400 border-lime-500/30',
    },
    {
        limit: 2.0,
        label: 'profitable',
        className: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    },
    {
        limit: 4.0,
        label: 'exceptional',
        className: 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30',
    },
    {
        limit: Number.MAX_SAFE_INTEGER,
        label: 'insane',
        className: 'bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30',
    },
] as const;

export type ResourceTriggerProps = {
    name: string;
    displayName?: string;
    bid?: MarketBidEntry;
    offer?: MarketOfferEntry;
    overviewRow?: MarketOverviewRow;
    storageQuantity?: number;
    visibleColumns: import('./columnConfig').ColumnConfig[];
    planetId: string;
};

export type ResourceAccordionItemProps = {
    resourceName: string;
    agentId: string;
    assets: AgentPlanetAssets;
    local: LocalResourceState;
    onLocalChange: (name: string, patch: Partial<LocalResourceState>) => void;
    isOpen: boolean;
    overviewRow?: MarketOverviewRow;
    visibleColumns: import('./columnConfig').ColumnConfig[];
    allPlanetDeposits?: Record<string, number>;
    ships: ConsumptionShipInfo[];
};

export type BuySectionProps = {
    resourceName: string;
    bid?: MarketBidEntry;
    local: LocalResourceState;
    assets: AgentPlanetAssets;
    overviewRow?: MarketOverviewRow;
    onLocalChange: (name: string, patch: Partial<LocalResourceState>) => void;
    onSaveBuy: () => void;
    onResetBuy: () => void;
    onCancelBid: () => void;
    onAutomationChange: (automated: boolean) => void;
    onSaveBuyAutoConfig: () => void;
    onResetBuyAutoConfig: () => void;
    buyPriceSaving: boolean;
    buyAutomationSaving: boolean;
    buyAutoConfigSaving: boolean;
    buyAutoConfigSuccessMsg: string | null;
    buyAutoConfigErrorMsg: string | null;
    buySuccessMsg: string | null;
    buyErrorMsg: string | null;

    planetId: string;
    ships: ConsumptionShipInfo[];
    /** Overlay message for the automation zone (Switch + header) */
    buyAutomationOverlay?: string | null;
    /** Overlay message for the auto-config zone */
    buyAutoConfigOverlay?: string | null;
    /** Overlay message for the price/quantity inputs zone */
    buyPriceOverlay?: string | null;
};

export type SellSectionProps = {
    resourceName: string;
    offer?: MarketOfferEntry;
    local: LocalResourceState;
    assets: AgentPlanetAssets;
    overviewRow?: MarketOverviewRow;
    onLocalChange: (name: string, patch: Partial<LocalResourceState>) => void;
    onSaveSell: () => void;
    onResetSell: () => void;
    onCancelOffer: () => void;
    onAutomationChange: (automated: boolean) => void;
    onSaveSellAutoConfig: () => void;
    onResetSellAutoConfig: () => void;
    sellPriceSaving: boolean;
    sellAutomationSaving: boolean;
    sellAutoConfigSaving: boolean;
    sellAutoConfigSuccessMsg: string | null;
    sellAutoConfigErrorMsg: string | null;
    sellSuccessMsg: string | null;
    sellErrorMsg: string | null;

    planetId: string;
    /** Overlay message for the automation zone (Switch + header) */
    sellAutomationOverlay?: string | null;
    /** Overlay message for the auto-config zone */
    sellAutoConfigOverlay?: string | null;
    /** Overlay message for the price/quantity inputs zone */
    sellPriceOverlay?: string | null;
};
