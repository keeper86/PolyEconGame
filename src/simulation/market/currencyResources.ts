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
    name: 'Paraseto',
};

const currencySuerte: Resource = {
    ...currencyResourceDefault,
    name: 'Scheine',
};

const currencyPandara: Resource = {
    ...currencyResourceDefault,
    name: 'Tinar',
};

const currencyAlphaCentauri: Resource = {
    ...currencyResourceDefault,
    name: 'Centas',
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
        symbol: '₡',
        resource: currencyAlphaCentauri,
    },
};

export const CURRENCY_RESOURCE_PREFIX = 'CUR_';

export const DEFAULT_EXCHANGE_RATE = 1.0;

export const FOREX_PRICE_FLOOR = PRICE_FLOOR;

export function getCurrencyResourceName(planetId: string): string {
    return `${CURRENCY_RESOURCE_PREFIX}${planetId}`;
}

export function getCurrencyResource(planetId: string): Resource {
    return {
        name: getCurrencyResourceName(planetId),
        form: 'currency',
        level: 'currency',
        volumePerQuantity: 0,
        massPerQuantity: 0,
    };
}

export function isCurrencyResource(resource: Resource): boolean {
    return resource.form === 'currency';
}

export function getCurrencyIssuingPlanetId(resource: Resource): string | null {
    if (!isCurrencyResource(resource)) {
        return null;
    }
    return resource.name.startsWith(CURRENCY_RESOURCE_PREFIX)
        ? resource.name.slice(CURRENCY_RESOURCE_PREFIX.length)
        : null;
}
