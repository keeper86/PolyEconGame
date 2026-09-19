export const BANDS = [
    { color: '#7f1d1d', limit: 0.9 },
    { color: '#b91c1c', limit: 0.75 },
    { color: '#ea580c', limit: 0.5 },
    { color: '#f59e0b', limit: 0.25 },
    { color: '#d9e70eff', limit: 0.1 },
    { color: '#16a34a', limit: 0 },
] as const;

export function classifyBand(value: number): number {
    const index = BANDS.findIndex((band) => value > band.limit);
    return index === -1 ? BANDS.length - 1 : index;
}
