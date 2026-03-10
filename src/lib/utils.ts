import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export const formatNumbers = (n: number): string => {
    const abbreviations: [number, string][] = [
        [1_000_000_000_000, 'T'],
        [1_000_000_000, 'B'],
        [1_000_000, 'M'],
        [1_000, 'k'],
    ];
    for (const [value, suffix] of abbreviations) {
        if (Math.abs(n) >= value) {
            return `${(n / value).toFixed(2)}${suffix}`;
        }
    }
    return n.toFixed(2);
};
