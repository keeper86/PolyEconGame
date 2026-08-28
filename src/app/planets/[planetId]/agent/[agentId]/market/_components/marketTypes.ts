import type { MarketOverviewRow } from '@/server/controller/planet';
import type { ConsumptionShipInfo } from '@/simulation/market/consumptionShipInfo';
import type {
    AgentPlanetAssets,
    AutomatedPricingConfig,
    SellDiagnostics,
    BuyDiagnostics,
} from '@/simulation/planet/planet';

export type AutoConfigLocalState = {
    priceAdjustMaxUp: string;
    priceAdjustMaxDown: string;
    costSpringStrength: string;
    bidOfferMaxCostMultiplier: string;
    inventorySmoothingMaxExtra: string;
    targetSellThrough: string;
    automatedCostFloorBuffer: string;
    inputBufferTargetTicks: string;
    targetFillRate: string;
    freeBuyQuantity: string;
    freeRetainment: string;
    freeBuyQuantitySmoothingMaxExtra: string;
    freeRetainmentSmoothingMaxExtra: string;
};

export const BUY_PRICING_KEYS: (keyof AutoConfigLocalState)[] = [
    'priceAdjustMaxUp',
    'priceAdjustMaxDown',
    'costSpringStrength',
    'bidOfferMaxCostMultiplier',
    'targetFillRate',
];

export const BUY_VOLUME_KEYS: (keyof AutoConfigLocalState)[] = [
    'inputBufferTargetTicks',
    'inventorySmoothingMaxExtra',
    'freeBuyQuantity',
    'freeBuyQuantitySmoothingMaxExtra',
];

export const SELL_PRICING_KEYS: (keyof AutoConfigLocalState)[] = [
    'priceAdjustMaxUp',
    'priceAdjustMaxDown',
    'costSpringStrength',
    'automatedCostFloorBuffer',
    'targetSellThrough',
];

export const SELL_VOLUME_KEYS: (keyof AutoConfigLocalState)[] = ['freeRetainment', 'freeRetainmentSmoothingMaxExtra'];

export function autoConfigToLocal(config: AutomatedPricingConfig | undefined): AutoConfigLocalState {
    return {
        priceAdjustMaxUp: config?.priceAdjustMaxUp?.toString() ?? '',
        priceAdjustMaxDown: config?.priceAdjustMaxDown?.toString() ?? '',
        costSpringStrength: config?.costSpringStrength?.toString() ?? '',
        bidOfferMaxCostMultiplier: config?.bidOfferMaxCostMultiplier?.toString() ?? '',
        inventorySmoothingMaxExtra: config?.inventorySmoothingMaxExtra?.toString() ?? '',
        targetSellThrough: config?.targetSellThrough?.toString() ?? '',
        automatedCostFloorBuffer: config?.automatedCostFloorBuffer?.toString() ?? '',
        inputBufferTargetTicks: config?.inputBufferTargetTicks?.toString() ?? '',
        targetFillRate: config?.targetFillRate?.toString() ?? '',
        freeBuyQuantity: config?.freeBuyQuantity?.toString() ?? '',
        freeRetainment: config?.freeRetainment?.toString() ?? '',
        freeBuyQuantitySmoothingMaxExtra: config?.freeBuyQuantitySmoothingMaxExtra?.toString() ?? '',
        freeRetainmentSmoothingMaxExtra: config?.freeRetainmentSmoothingMaxExtra?.toString() ?? '',
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
        'targetSellThrough',
        'automatedCostFloorBuffer',
        'inputBufferTargetTicks',
        'targetFillRate',
        'freeBuyQuantity',
        'freeRetainment',
        'freeBuyQuantitySmoothingMaxExtra',
        'freeRetainmentSmoothingMaxExtra',
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
        'targetSellThrough',
        'automatedCostFloorBuffer',
        'inputBufferTargetTicks',
        'targetFillRate',
        'freeBuyQuantity',
        'freeRetainment',
        'freeBuyQuantitySmoothingMaxExtra',
        'freeRetainmentSmoothingMaxExtra',
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

// The values Reset restores: the committed (last applied) config for the given keys.
// Until apply, the committed config is the "current" setting; presets/sliders only draft.
export function buildResetTarget(
    committedLocal: AutoConfigLocalState,
    keys: readonly (keyof AutoConfigLocalState)[],
): Record<string, string> {
    const result: Record<string, string> = {};
    for (const k of keys) {
        result[k] = committedLocal[k];
    }
    return result;
}

// Reset is meaningful when the draft differs from the committed state: either the values
// differ from the committed config, or the active mode (e.g. custom) differs from the mode
// the committed config would be detected as.
export function canResetToTarget(
    local: AutoConfigLocalState,
    target: Record<string, string>,
    keys: readonly (keyof AutoConfigLocalState)[],
    activeMode: string,
    postResetMode: string,
): boolean {
    const valuesDiffer = keys.some((key) => {
        const localStr = local[key];
        const targetStr = target[key] ?? '';
        if (localStr === '' && targetStr === '') {
            return false;
        }
        if (localStr === '' || targetStr === '') {
            return true;
        }
        return parseFloat(localStr) !== parseFloat(targetStr);
    });
    return valuesDiffer || activeMode !== postResetMode;
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
    offerAutomated: boolean;
    bidPrice: string;
    bidAutomated: boolean;

    buyAutoConfig: AutoConfigLocalState;
    sellAutoConfig: AutoConfigLocalState;

    dirtyFields: {
        offerPrice: boolean;
        bidPrice: boolean;
    };

    validationErrors: {
        offerPrice?: string;
        bidPrice?: string;
    };

    savedOfferPrice: string;
    savedOfferAutomated: boolean;
    savedBidPrice: string;
    savedBidAutomated: boolean;
};

export type Props = {
    agentId: string;
    planetId: string;
    assets: AgentPlanetAssets;
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
    agentId: string;
    bid?: MarketBidEntry;
    local: LocalResourceState;
    assets: AgentPlanetAssets;
    overviewRow?: MarketOverviewRow;
    onLocalChange: (name: string, patch: Partial<LocalResourceState>) => void;
    planetId: string;
    ships: ConsumptionShipInfo[];
};

export type SellSectionProps = {
    resourceName: string;
    agentId: string;
    offer?: MarketOfferEntry;
    local: LocalResourceState;
    assets: AgentPlanetAssets;
    overviewRow?: MarketOverviewRow;
    onLocalChange: (name: string, patch: Partial<LocalResourceState>) => void;
    planetId: string;
};
