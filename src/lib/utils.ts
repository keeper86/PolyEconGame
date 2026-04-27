import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const EPSILON = 1e-4;
export const formatNumbers = (n: number | null | undefined): string => {
    if (n == null || !isFinite(n)) {
        return '—';
    }
    if (Math.abs(n) < EPSILON) {
        if (n === 0) {
            return '0';
        }
        return '<0.0001';
    }

    let currentNumber = n;
    let currentSuffix = '';
    const abbreviations: [number, string][] = [
        [1_000_000_000_000_000_000_000, 'S'],
        [1_000_000_000_000_000_000, 'Qt'],
        [1_000_000_000_000_000, 'Q'],
        [1_000_000_000_000, 'T'],
        [1_000_000_000, 'B'],
        [1_000_000, 'M'],
        [1_000, 'k'],
    ];
    for (const [value, suffix] of abbreviations) {
        if (Math.abs(n) * 1.05 >= value) {
            currentSuffix = suffix;
            currentNumber = n / value;
            break;
        }
    }

    // how to map this number to
    // x.xx or xx.x
    const leadingWithZero = Math.trunc(currentNumber) === 0;
    const formatted = currentNumber.toPrecision(leadingWithZero ? 2 : 3);
    // Strip trailing zeros: "1.230" → "1.23", "1.00" → "1", "110." → "110"
    return (
        formatted
            .replace(/(\.\d*?[1-9])0+$/u, '$1')
            .replace(/\.0+$/u, '')
            .replace(/\.$/u, '') + currentSuffix
    );
};

export type CurrencyInfo = {
    symbol: string;
    name: string;
};
const currencyMapping: Record<string, CurrencyInfo> = {
    'earth': {
        symbol: '€',
        name: 'Eartho',
    },
    'gune': {
        symbol: '₩',
        name: 'Wüsten-Dollar',
    },
    'icedonia': {
        symbol: '₤',
        name: 'Liquido',
    },
    'paradies': {
        symbol: '₽',
        name: 'Paradies-Pesete',
    },
    'suerte': {
        symbol: '$',
        name: 'Scheine',
    },
    'pandara': {
        symbol: '₦',
        name: "Na'avi",
    },
    'alpha-centauri': {
        symbol: '₳',
        name: 'Alphas',
    },
};
export type Units = 'currency' | 'tonnes' | 'units';

export function getCurrencySymbol(planetId: string): string {
    return currencyMapping[planetId]?.symbol ?? '¤';
}

export const formatNumberWithUnit = (n: number | null | undefined, unit: Units, planetId?: string): string => {
    const formattedNumber = formatNumbers(n);
    if (formattedNumber === '—') {
        return formattedNumber;
    }
    if (unit === 'currency' && planetId) {
        const info = currencyMapping[planetId];
        if (info) {
            return `${formattedNumber} ${info.symbol}`;
        }
    }
    if (unit === 'tonnes') {
        return `${formattedNumber} t`;
    }
    return `${formattedNumber} ${unit}`;
};
