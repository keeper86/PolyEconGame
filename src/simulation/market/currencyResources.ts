/**
 * simulation/market/currencyResources.ts
 *
 * Helpers for treating each planet's currency as a tradable resource on
 * other planets' forex markets.
 *
 * Currency resources are dynamic (not in the static ALL_RESOURCES catalog).
 * They have zero volume and mass, are perfectly durable, and carry no storage
 * cost.  Ownership is backed 1-to-1 by the agent's foreignDeposits on the
 * issuing planet.
 */

import { PRICE_FLOOR } from '../constants';
import type { Resource } from '../planet/claims';

export const CURRENCY_RESOURCE_PREFIX = 'CUR_';

/** Default exchange rate used when no prior clearing price exists (1:1 parity). */
export const DEFAULT_EXCHANGE_RATE = 1.0;

/** Minimum legal forex price — same floor as all other resources. */
export const FOREX_PRICE_FLOOR = PRICE_FLOOR;

/**
 * Returns the resource name used to represent one unit of a planet's currency
 * when it is traded on another planet's forex market.
 */
export function getCurrencyResourceName(planetId: string): string {
    return `${CURRENCY_RESOURCE_PREFIX}${planetId}`;
}

/**
 * Returns a Resource descriptor for the currency issued by `planetId`.
 * Volume and mass are zero — currency resources bypass storage accounting.
 */
export function getCurrencyResource(planetId: string): Resource {
    return {
        name: getCurrencyResourceName(planetId),
        form: 'currency',
        level: 'currency',
        volumePerQuantity: 0,
        massPerQuantity: 0,
    };
}

/** Returns true if the given resource represents a currency. */
export function isCurrencyResource(resource: Resource): boolean {
    return resource.form === 'currency';
}

/**
 * Extracts the issuing planet id from a currency resource name.
 * Returns null if the resource is not a currency.
 */
export function getCurrencyIssuingPlanetId(resource: Resource): string | null {
    if (!isCurrencyResource(resource)) {
        return null;
    }
    return resource.name.startsWith(CURRENCY_RESOURCE_PREFIX)
        ? resource.name.slice(CURRENCY_RESOURCE_PREFIX.length)
        : null;
}
