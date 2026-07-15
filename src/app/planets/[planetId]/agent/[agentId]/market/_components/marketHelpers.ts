import { CURRENCY_RESOURCE_PREFIX, getCurrencyResource } from '@/simulation/market/currencyResources';
import type { ProductionFacility } from '@/simulation/planet/facility';
import type { AgentPlanetAssets } from '@/simulation/planet/planet';
import type { ConsumptionInfo, ConsumptionShipInfo } from '@/simulation/market/consumptionSources';
import { computeConsumptionBreakdown } from '@/simulation/market/consumptionSources';
import { ALL_RESOURCES } from '@/simulation/planet/resourceCatalog';
import { constructionServiceResourceType } from '@/simulation/planet/services';
import { transportShipBuildResources } from '@/simulation/ships/ships';
import type { MarketBidEntry, MarketOfferEntry } from './marketTypes';
import { autoConfigToLocal } from './marketTypes';

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

export function consumptionPerTick(facilities: ProductionFacility[], resourceName: string): number {
    return facilities.reduce((sum, f) => {
        const need = f.needs.find((n) => n.resource.name === resourceName);
        return need ? sum + need.quantity * f.scale : sum;
    }, 0);
}

export function productionPerTick(facilities: ProductionFacility[], resourceName: string): number {
    return facilities.reduce((sum, f) => {
        const prod = f.produces.find((p) => p.resource.name === resourceName);
        return prod ? sum + prod.quantity * f.scale : sum;
    }, 0);
}

// ── Re-export types from the shared function ─────────────────────────────────
export type { ConsumptionBreakdownItem, ConsumptionInfo } from '@/simulation/market/consumptionSources';

export function totalConsumptionPerTick(
    assets: AgentPlanetAssets,
    ships: ConsumptionShipInfo[],
    planetId: string,
    resourceName: string,
): ConsumptionInfo {
    return computeConsumptionBreakdown(
        assets.productionFacilities,
        assets.managementFacilities,
        assets.shipConstructionFacilities,
        ships,
        planetId,
        resourceName,
    );
}

export function getResourceByName(resourceName: string) {
    if (resourceName.startsWith(CURRENCY_RESOURCE_PREFIX)) {
        return getCurrencyResource(resourceName.slice(CURRENCY_RESOURCE_PREFIX.length));
    }
    return ALL_RESOURCES.find((r) => r.name === resourceName);
}

export function resourceNameToSlug(resourceName: string): string {
    return resourceName.toLowerCase().replace(/\s+/g, '-');
}

export function slugToResourceName(slug: string): string | undefined {
    if (slug.startsWith(CURRENCY_RESOURCE_PREFIX.toLowerCase())) {
        return CURRENCY_RESOURCE_PREFIX + slug.slice(CURRENCY_RESOURCE_PREFIX.length);
    }
    return ALL_RESOURCES.find((r) => resourceNameToSlug(r.name) === slug)?.name;
}

export function buildResourceList(
    assets: AgentPlanetAssets,
    showAll: boolean,
    forceInclude: string[] = [],
    availableCurrencies: { name: string }[] = [],
): { name: string }[] {
    const {
        productionFacilities: facilities,
        managementFacilities,
        shipConstructionFacilities,
        storageFacility,
        market,
    } = assets;
    const buyBids = market?.buy ?? {};
    const sellOffers = market?.sell ?? {};

    if (showAll) {
        const base = ALL_RESOURCES.filter((r) => r.form !== 'landBoundResource').map((r) => ({ name: r.name }));
        return [...base, ...availableCurrencies];
    }

    const seen = new Set<string>();
    const result: { name: string }[] = [];

    const add = (name: string) => {
        if (!seen.has(name)) {
            seen.add(name);
            result.push({ name });
        }
    };

    add(constructionServiceResourceType.name);

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

    for (const f of managementFacilities) {
        for (const { resource } of f.needs) {
            if (resource.form !== 'landBoundResource') {
                add(resource.name);
            }
        }
    }

    if (shipConstructionFacilities.length > 0) {
        transportShipBuildResources.forEach((name) => {
            const type = getResourceByName(name);
            if (type && type.form !== 'landBoundResource') {
                add(type.name);
            }
        });
    }

    for (const name of Object.keys(buyBids)) {
        add(name);
    }
    for (const name of Object.keys(sellOffers)) {
        add(name);
    }

    for (const [name, entry] of Object.entries(storageFacility.currentInStorage)) {
        if ((entry?.quantity ?? 0) > 0) {
            add(name);
        }
    }

    for (const name of forceInclude) {
        add(name);
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

            buyAutoConfig: autoConfigToLocal(bid?.autoConfig),
            sellAutoConfig: autoConfigToLocal(offer?.autoConfig),

            dirtyFields: {
                offerPrice: false,
                offerRetainment: false,
                bidPrice: false,
                bidStorageTarget: false,
            },

            validationErrors: {},

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
