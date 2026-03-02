/**
 * Distribute `total` items across `weights` proportionally to `weights`,
 * using Hamilton's largest-remainder method to ensure sum === total.
 */
export function distributeProportionally(total: number, weights: number[]): number[] {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum === 0) {
        return weights.map(() => 0);
    }

    const exact = weights.map((w) => (w / sum) * total);
    const floored = exact.map(Math.floor);
    const remainder = total - floored.reduce((a, b) => a + b, 0);

    const fractionals = exact.map((e, i) => ({ i, frac: e - floored[i] }));
    fractionals.sort((a, b) => {
        if (b.frac !== a.frac) {
            return b.frac - a.frac;
        }
        return a.i - b.i; // deterministic tie-breaker by index ascending
    });

    for (let j = 0; j < remainder; j++) {
        floored[fractionals[j].i]++;
    }
    return floored;
}
