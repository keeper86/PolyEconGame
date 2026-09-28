import { defaultLocale, getDecimalSeparator, type Locale } from '@/i18n/config';
import { currencyMapping } from '@/simulation/market/currencyResources';
import type { ResourceType } from '@/simulation/planet/claims';
import { formatNumbers } from '@/simulation/utils/numberFormat';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import de from '../../messages/de.json';
import en from '../../messages/en.json';

const catalogs = { en, de } as const;

const dayWord = (locale: Locale, count: number | null | undefined): string => {
    const units = catalogs[locale].Units;
    return count === 1 ? units.day : units.days;
};

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export type Units = 'currency' | 'tonnes' | 'litres' | 'units' | 'persons' | 'percent' | 'm3' | 'days' | 'none';

export function resourceFormToUnit(form: ResourceType | undefined): Exclude<Units, 'currency'> {
    switch (form) {
        case 'solid':
        case 'pieces':
            return 'tonnes';
        case 'liquid':
            return 'litres';
        case 'landBoundResource':
        case 'services':
        default:
            return 'units';
    }
}

export const formatNumberWithUnit = (
    n: number | null | undefined,
    unit: Units,
    planetId: string | undefined,
    locale: Locale,
): string => {
    const formattedNumber = formatNumbers(n, getDecimalSeparator(locale));
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
        return `${formattedNumber}(m³)`;
    }
    if (unit === 'percent') {
        return `${formattedNumber}%`;
    }
    if (unit === 'days') {
        return `${formattedNumber} ${dayWord(locale, n)}`;
    }

    return formattedNumber;
};
export function formatWallTime(ms: number, short = false, locale: Locale = defaultLocale): string {
    const units = catalogs[locale].Units;
    const decimalSeparator = getDecimalSeparator(locale);
    if (ms < 1000) {
        return units.lessThanOneSecond;
    }
    const totalSeconds = Math.round(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let result = '';
    if (days > 0) {
        result += `${days}${units.daysShort} `;
        if (short) {
            return `${(totalSeconds / 86400).toFixed(1).replace('.', decimalSeparator)}${units.daysShort}`;
        }
    }
    if (hours > 0) {
        result += `${hours}${units.hoursShort} `;
        if (short) {
            return `${(totalSeconds / 3600).toFixed(1).replace('.', decimalSeparator)}${units.hoursShort}`;
        }
    }
    if (minutes > 0) {
        result += `${minutes}${units.minutesShort} `;
        if (short) {
            return `${(totalSeconds / 60).toFixed(1).replace('.', decimalSeparator)}${units.minutesShort}`;
        }
    }
    if (seconds > 0) {
        result += `${seconds}${units.secondsShort} `;
    }
    return result.slice(0, -1);
}
