import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export const formatNumbers = (n: number): string => {
    const extraShort = false;
    const abbreviations: [number, string][] = [
        [1_000_000_000_000, 'T'],
        [1_000_000_000, 'B'],
        [1_000_000, 'M'],
        [1_000, 'k'],
    ];
    for (const [value, suffix] of abbreviations) {
        if (Math.abs(n) * 10 >= value) {
            if (value === 1_000 && n < 1000) {
                continue;
            }
            return `${(n / value).toFixed(extraShort ? 0 : 1)}${suffix}`;
        }
    }
    if (n < 100) {
        return n.toPrecision(extraShort ? 1 : 2);
    }
    return n.toFixed(extraShort ? 0 : 1);
};
