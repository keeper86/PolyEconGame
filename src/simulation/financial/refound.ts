import { START_YEAR, TICKS_PER_YEAR } from '../constants';

export const REFOUND_SYMBOL = '♻';

export function parseRefoundName(name: string): { base: string; refoundNumber: number } {
    const markerIndex = name.lastIndexOf(REFOUND_SYMBOL);
    if (markerIndex === -1) {
        return { base: name.trim(), refoundNumber: 0 };
    }
    const suffix = name.slice(markerIndex + REFOUND_SYMBOL.length);
    const refoundNumber = Number(suffix);
    if (!Number.isInteger(refoundNumber) || refoundNumber < 1) {
        return { base: name.trim(), refoundNumber: 0 };
    }
    return { base: name.slice(0, markerIndex).trimEnd(), refoundNumber };
}

export function buildRefoundName(base: string, refoundNumber: number): string {
    return `${base} ${REFOUND_SYMBOL}${refoundNumber}`;
}

export function nextRefoundName(name: string): string {
    const { base, refoundNumber } = parseRefoundName(name);
    return buildRefoundName(base, refoundNumber + 1);
}

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function refoundId(name: string, tick: number): string {
    const { base } = parseRefoundName(name);
    const year = Math.floor((tick - 1) / TICKS_PER_YEAR) + START_YEAR;
    return `${slugify(base)}_lastRefounded_${year}`;
}
