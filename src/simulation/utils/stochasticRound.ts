let s0 = 1;
let s1 = 2;

export function seedRng(seed?: number | null): void {
    if (seed == null) {
        s0 = 1;
        s1 = 2;
        return;
    }
    // Spread a single 32-bit seed into two 32-bit halves via a simple hash.
    s0 = seed | 0 || 1; // avoid zero
    s1 = (seed >>> 16) ^ ((seed << 16) | 1);
    if (s0 === 0 && s1 === 0) {
        s0 = 1;
    }
    // Warm up: discard the first few values to mix the state.
    for (let i = 0; i < 20; i++) {
        nextRandom();
    }
}

/**
 * Return a pseudo-random float in [0, 1).
 * Uses xorshift128+ internally.
 */
export function nextRandom(): number {
    let a = s0;
    const b = s1;
    s0 = b;
    a ^= a << 23;
    a ^= a >>> 17;
    a ^= b;
    a ^= b >>> 26;
    s1 = a;
    // Map to [0, 1) — use unsigned 32-bit of (s0 + s1)
    return ((s0 + s1) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// Stochastic rounding
// ---------------------------------------------------------------------------

/**
 * Stochastic (probabilistic) rounding of a non-negative real number.
 *
 * Returns `floor(x)` with probability `1 − frac(x)` and `ceil(x)` with
 * probability `frac(x)`.  This is **unbiased**: `E[result] = x`.
 *
 * For negative values the behaviour is analogous (rounds towards zero
 * with appropriate probability).
 *
 * @param x  The value to round.  Must be ≥ 0 for population counts.
 * @returns  An integer close to `x` with unbiased expected value.
 */
export function stochasticRound(x: number): number {
    if (!Number.isFinite(x)) {
        return 0;
    }
    const base = Math.floor(x);
    const frac = x - base;
    if (frac === 0) {
        return base;
    }
    return nextRandom() < frac ? base + 1 : base;
}
