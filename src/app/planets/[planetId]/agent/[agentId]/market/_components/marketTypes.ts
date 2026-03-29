import type { MarketOverviewRow } from '@/server/controller/planet';
import type { AgentPlanetAssets } from '../../../_component/useAgentPlanetDetail';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Time-to-live for feedback messages in milliseconds */
export const TTL_FEEDBACK = 5_000; // 5 seconds

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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
    /** Retainment: keep at least this many units; sell qty = max(0, inventory - retainment). */
    offerRetainment: string;
    offerAutomated: boolean;
    bidPrice: string;
    /** Storage target: fill up to this; buy qty = max(0, target - inventory). */
    bidStorageTarget: string;
    bidAutomated: boolean;
    // UI-only helpers — not sent to server
    targetBufferTicks: string;

    // Dirty state tracking
    dirtyFields: {
        offerPrice: boolean;
        offerRetainment: boolean;
        offerAutomated: boolean;
        bidPrice: boolean;
        bidStorageTarget: boolean;
        bidAutomated: boolean;
    };

    // Validation errors
    validationErrors: {
        offerPrice?: string;
        offerRetainment?: string;
        bidPrice?: string;
        bidStorageTarget?: string;
    };

    // Saved state snapshots for comparison
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
};

/* ------------------------------------------------------------------ */
/*  Market status classification                                       */
/* ------------------------------------------------------------------ */

export type MarketStatus = 'balanced' | 'mostly' | 'partial-shortage' | 'shortage' | 'oversupply' | 'no-demand';

export const MARKET_STATUS_CONFIG: Record<MarketStatus, { label: string; className: string }> = {
    'balanced': { label: 'Full', className: 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30' },
    'mostly': {
        label: 'Mostly',
        className: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
    },
    'partial-shortage': {
        label: 'Partial',
        className: 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30',
    },
    'shortage': { label: 'Shortage', className: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30' },
    'oversupply': {
        label: 'Oversupply',
        className: 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30',
    },
    'no-demand': {
        label: 'No demand',
        className: 'bg-slate-500/20 text-slate-500 dark:text-slate-400 border-slate-500/30',
    },
};

export type ResourceTriggerProps = {
    name: string;
    bid?: MarketBidEntry;
    offer?: MarketOfferEntry;
    overviewRow?: MarketOverviewRow;
    storageQuantity?: number;
    visibleColumns: import('../../../_component/columnConfig').ColumnConfig[];
};

export type ResourceAccordionItemProps = {
    resourceName: string;
    agentId: string;
    assets: AgentPlanetAssets;
    local: LocalResourceState;
    onLocalChange: (name: string, patch: Partial<LocalResourceState>) => void;
    _isOpen: boolean;
    overviewRow?: MarketOverviewRow;
    visibleColumns: import('../../../_component/columnConfig').ColumnConfig[];
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
};
