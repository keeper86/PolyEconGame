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
        return '0';
    }

    let currentNumber = n;
    let currentSuffix = '';
    const abbreviations: [number, string][] = [
        [1_000_000_000_000, 'T'],
        [1_000_000_000, 'B'],
        [1_000_000, 'M'],
        [1_000, 'k'],
    ];
    for (const [value, suffix] of abbreviations) {
        if (Math.abs(n) < 1000) {
            break;
        }
        if (Math.abs(n) * 10 >= value) {
            currentSuffix = suffix;
            currentNumber = n / value;
            break;
        }
    }

    // how to map this number to
    // x.xx or xx.x
    const leadingWithZero = Math.trunc(currentNumber) === 0;
    const formatted = currentNumber.toPrecision(leadingWithZero ? 2 : 3);
    // delete trailing zeros from the decimal part and the dot if it's the last character,
    // but keep integers like 110 as-is
    return formatted.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.$/u, '') + currentSuffix;
};
