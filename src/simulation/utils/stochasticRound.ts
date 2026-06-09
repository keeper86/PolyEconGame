let s0 = 1;
let s1 = 2;

export function seedRng(seed?: number | null): void {
    if (seed == null) {
        s0 = 1;
        s1 = 2;
        return;
    }

    s0 = seed | 0 || 1;
    s1 = (seed >>> 16) ^ ((seed << 16) | 1);
    if (s0 === 0 && s1 === 0) {
        s0 = 1;
    }

    for (let i = 0; i < 20; i++) {
        nextRandom();
    }
}

export function nextRandom(): number {
    let a = s0;
    const b = s1;
    s0 = b;
    a ^= a << 23;
    a ^= a >>> 17;
    a ^= b;
    a ^= b >>> 26;
    s1 = a;

    return ((s0 + s1) >>> 0) / 4294967296;
}

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
