import { currencyMapping } from '@/simulation/market/currencyResources';
import type { ResourceType } from '@/simulation/planet/claims';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

import { formatNumbers } from '@/simulation/utils/numberFormat';

export type Units = 'currency' | 'tonnes' | 'litres' | 'units' | 'persons' | 'percent' | 'm3' | 'days';

/** Maps a resource form to its appropriate display unit. */
export function resourceFormToUnit(form: ResourceType): Exclude<Units, 'currency'> {
    switch (form) {
        case 'solid':
        case 'pieces':
        case 'gas':
            return 'tonnes';
        case 'liquid':
            return 'litres';
        case 'landBoundResource':
        case 'services':
        default:
            return 'units';
    }
}

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
            return `${formattedNumber}${info.symbol}`;
        }
    }
    if (unit === 'tonnes') {
        return `${formattedNumber}t`;
    }
    if (unit === 'litres') {
        return `${formattedNumber}ℓ`;
    }
    if (unit === 'm3') {
        return `${formattedNumber}m³`;
    }
    if (unit === 'percent') {
        return `${formattedNumber}%`;
    }
    if (unit === 'days') {
        return `${formattedNumber} days`;
    }
    // 'units' and 'persons' — no suffix
    return formattedNumber;
};
