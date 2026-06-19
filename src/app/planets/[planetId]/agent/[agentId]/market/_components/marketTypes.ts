import type { MarketOverviewRow } from '@/server/controller/planet';
import type { AgentPlanetAssets } from '@/simulation/planet/planet';

export const TTL_FEEDBACK = 5_000;

export type MarketBidEntry = {
    bidPrice?: number;
    bidStorageTarget?: number;
    lastBought?: number;
    lastSpent?: number;
    storageFullWarning?: boolean;
    depositScaleWarning?: 'scaled' | 'dropped';
    storageScaleWarning?: 'scaled' | 'dropped';
    automated?: boolean;
};

export type MarketOfferEntry = {
    offerPrice?: number;
    offerRetainment?: number;
    lastSold?: number;
    lastRevenue?: number;
    priceDirection?: number;
    automated?: boolean;
};

export type LocalResourceState = {
    offerPrice: string;

    offerRetainment: string;
    offerAutomated: boolean;
    bidPrice: string;

    bidStorageTarget: string;
    bidAutomated: boolean;

    targetBufferTicks: string;

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
    buySaving: boolean;
    buySuccessMsg: string | null;
    buyErrorMsg: string | null;

    planetId: string;
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
    sellSaving: boolean;
    sellSuccessMsg: string | null;
    sellErrorMsg: string | null;

    planetId: string;
};
