import { currencyMapping } from '@/simulation/market/currencyResources';
import type { ResourceType } from '@/simulation/planet/claims';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

import { formatNumbers } from '@/simulation/utils/numberFormat';

export type Units = 'currency' | 'tonnes' | 'litres' | 'units' | 'persons' | 'percent' | 'm3' | 'days' | 'none';

export function resourceFormToUnit(form: ResourceType | undefined): Exclude<Units, 'currency'> {
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

    return formattedNumber;
};
export function formatWallTime(ms: number, short = false): string {
    if (ms < 1000) {
        return '<1s';
    }
    const totalSeconds = Math.round(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let result = '';
    if (days > 0) {
        result += `${days}d `;
        if (short) {
            return `${(totalSeconds / 86400).toFixed(1)}d`;
        }
    }
    if (hours > 0) {
        result += `${hours}h `;
        if (short) {
            return `${(totalSeconds / 3600).toFixed(1)}h`;
        }
    }
    if (minutes > 0) {
        result += `${minutes}m `;
        if (short) {
            return `${(totalSeconds / 60).toFixed(1)}m`;
        }
    }
    if (seconds > 0) {
        result += `${seconds}s `;
    }
    return result.slice(0, -1);
}
