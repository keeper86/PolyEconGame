import { ALL_RESOURCES } from '@/simulation/planet/resourceCatalog';
import type { ManagementFacility, ProductionFacility, StorageFacility } from '@/simulation/planet/facility';
import type { MarketBidEntry, MarketOfferEntry, MarketStatus } from './marketTypes';
import type { MarketOverviewRow } from '@/server/controller/planet';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function priceArrow(dir?: number): { label: string; className: string } {
    if (dir === undefined) {
        return { label: '', className: '' };
    }
    if (dir > 0) {
        return { label: '↑', className: 'text-green-600 dark:text-green-400' };
    }
    if (dir < 0) {
        return { label: '↓', className: 'text-red-500 dark:text-red-400' };
    }
    return { label: '→', className: 'text-muted-foreground' };
}

/**
 * Color class for the effective buy quantity.
 * Green = target met (order inactive), yellow = partially stocked, red = far below target.
 */
export function buyFulfillmentClass(inventory: number, storageTarget: number): string {
    if (storageTarget <= 0) {
        return '';
    }
    const ratio = inventory / storageTarget;
    if (ratio >= 1) {
        return 'text-green-600 dark:text-green-400';
    }
    if (ratio >= 0.5) {
        return 'text-yellow-600 dark:text-yellow-400';
    }
    return 'text-red-500 dark:text-red-400';
}

/**
 * Color class for the effective sell quantity.
 * Green = plenty above retainment (active sell), yellow = small surplus, red = nothing to sell (inactive).
 */
export function sellFulfillmentClass(inventory: number, retainment: number): string {
    const effective = Math.max(0, inventory - retainment);
    if (effective <= 0) {
        return 'text-red-500 dark:text-red-400';
    }
    if (retainment <= 0 || effective > retainment) {
        return 'text-green-600 dark:text-green-400';
    }
    return 'text-yellow-600 dark:text-yellow-400';
}

/** Sum of consumption per tick (across all facilities) for a given input resource. */
export function consumptionPerTick(facilities: ProductionFacility[], resourceName: string): number {
    return facilities.reduce((sum, f) => {
        const need = f.needs.find((n) => n.resource.name === resourceName);
        return need ? sum + need.quantity * f.scale : sum;
    }, 0);
}

/** Sum of production per tick (across all facilities) for a given output resource. */
export function productionPerTick(facilities: ProductionFacility[], resourceName: string): number {
    return facilities.reduce((sum, f) => {
        const prod = f.produces.find((p) => p.resource.name === resourceName);
        return prod ? sum + prod.quantity * f.scale : sum;
    }, 0);
}

/** Get resource object by name */
export function getResourceByName(resourceName: string) {
    return ALL_RESOURCES.find((r) => r.name === resourceName);
}

/** Convert resource name to URL slug (inverse of slugToResourceName) */
export function resourceNameToSlug(resourceName: string): string {
    return resourceName.toLowerCase().replace(/\s+/g, '-');
}

/* ------------------------------------------------------------------ */
/*  Market status classification                                       */
/* ------------------------------------------------------------------ */

const OVERSUPPLY_RATIO_THRESHOLD = 2;

export function classifyMarket(row: MarketOverviewRow): MarketStatus {
    const { totalSupply, totalDemand, fillRatio } = row;
    if (totalDemand === 0 && totalSupply > 0) {
        return 'no-demand';
    }
    if (totalDemand > 0 && totalSupply / totalDemand >= OVERSUPPLY_RATIO_THRESHOLD) {
        return 'oversupply';
    }
    if (fillRatio >= 0.999) {
        return 'balanced';
    }
    if (fillRatio >= 0.8) {
        return 'mostly';
    }
    if (fillRatio >= 0.5) {
        return 'partial-shortage';
    }
    return 'shortage';
}

/** Build the deduplicated list of resources to show. */
export function buildResourceList(
    facilities: ProductionFacility[],
    buyBids: Record<string, MarketBidEntry>,
    sellOffers: Record<string, MarketOfferEntry>,
    storageFacility: StorageFacility,
    showAll: boolean,
    managementFacilities: ManagementFacility[] = [],
): { name: string }[] {
    if (showAll) {
        return ALL_RESOURCES.filter((r) => r.form !== 'landBoundResource').map((r) => ({ name: r.name }));
    }

    const seen = new Set<string>();
    const result: { name: string }[] = [];

    const add = (name: string) => {
        if (!seen.has(name)) {
            seen.add(name);
            result.push({ name });
        }
    };

    // Facility inputs and outputs
    for (const f of facilities) {
        for (const { resource } of f.needs) {
            if (resource.form !== 'landBoundResource') {
                add(resource.name);
            }
        }
        for (const { resource } of f.produces) {
            if (resource.form !== 'landBoundResource') {
                add(resource.name);
            }
        }
    }
    // Existing bids / offers
    for (const name of Object.keys(buyBids)) {
        add(name);
    }
    for (const name of Object.keys(sellOffers)) {
        add(name);
    }
    // Stuff already in storage
    for (const [name, entry] of Object.entries(storageFacility.currentInStorage)) {
        if ((entry?.quantity ?? 0) > 0) {
            add(name);
        }
    }

    // Construction Service: show if any facility is under construction
    const allFacilities = [...facilities, ...managementFacilities, storageFacility];
    if (allFacilities.some((f) => f.construction !== null)) {
        add('Construction Service');
    }

    return result;
}

export function buildInitialState(
    resources: { name: string }[],
    buyBids: Record<string, MarketBidEntry>,
    sellOffers: Record<string, MarketOfferEntry>,
): Record<string, import('./marketTypes').LocalResourceState> {
    const result: Record<string, import('./marketTypes').LocalResourceState> = {};
    for (const { name } of resources) {
        const bid = buyBids[name];
        const offer = sellOffers[name];

        const offerPrice = offer?.offerPrice !== undefined ? String(offer.offerPrice) : '';
        const offerRetainment = offer?.offerRetainment !== undefined ? String(Math.round(offer.offerRetainment)) : '';
        const offerAutomated = offer?.automated ?? false;
        const bidPrice = bid?.bidPrice !== undefined ? String(bid.bidPrice) : '';
        const bidStorageTarget = bid?.bidStorageTarget !== undefined ? String(Math.round(bid.bidStorageTarget)) : '';
        const bidAutomated = bid?.automated ?? false;

        result[name] = {
            offerPrice,
            offerRetainment,
            offerAutomated,
            bidPrice,
            bidStorageTarget,
            bidAutomated,
            targetBufferTicks: '',

            // Dirty state tracking - all false initially
            dirtyFields: {
                offerPrice: false,
                offerRetainment: false,
                offerAutomated: false,
                bidPrice: false,
                bidStorageTarget: false,
                bidAutomated: false,
            },

            // Validation errors - empty initially
            validationErrors: {},

            // Saved state snapshots
            savedOfferPrice: offerPrice,
            savedOfferRetainment: offerRetainment,
            savedOfferAutomated: offerAutomated,
            savedBidPrice: bidPrice,
            savedBidStorageTarget: bidStorageTarget,
            savedBidAutomated: bidAutomated,
        };
    }
    return result;
}
