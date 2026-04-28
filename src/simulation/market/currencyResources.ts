import { PRICE_FLOOR } from '../constants';
import type { Resource } from '../planet/claims';

const currencyResourceDefault = {
    form: 'currency' as const,
    level: 'currency' as const,
    volumePerQuantity: Number.MAX_SAFE_INTEGER,
    massPerQuantity: Number.MAX_SAFE_INTEGER,
};

export type CurrencyResource = {
    symbol: string;
    resource: Resource;
};

const currencyEarth: Resource = {
    ...currencyResourceDefault,
    name: 'Eartho',
};

const currencyGune: Resource = {
    ...currencyResourceDefault,
    name: 'Wüsten-Dollar',
};

const currencyIcedonia: Resource = {
    ...currencyResourceDefault,
    name: 'Liquido',
};

const currencyParadies: Resource = {
    ...currencyResourceDefault,
    name: 'Paradies-Pesete',
};

const currencySuerte: Resource = {
    ...currencyResourceDefault,
    name: 'Scheine',
};

const currencyPandara: Resource = {
    ...currencyResourceDefault,
    name: 'Naaavi',
};

const currencyAlphaCentauri: Resource = {
    ...currencyResourceDefault,
    name: 'Alphas',
};

export const currencyMapping: Record<string, CurrencyResource> = {
    'earth': {
        symbol: '€',
        resource: currencyEarth,
    },
    'gune': {
        symbol: '₩',
        resource: currencyGune,
    },
    'icedonia': {
        symbol: '₤',
        resource: currencyIcedonia,
    },
    'paradies': {
        symbol: '₽',
        resource: currencyParadies,
    },
    'suerte': {
        symbol: '$',
        resource: currencySuerte,
    },
    'pandara': {
        symbol: '₦',
        resource: currencyPandara,
    },
    'alpha-centauri': {
        symbol: '₳',
        resource: currencyAlphaCentauri,
    },
};

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
