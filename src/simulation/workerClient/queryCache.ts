import { getLatestTick } from './manager';

const SIM_DEBUG = typeof process !== 'undefined' && process.env?.SIM_DEBUG === '1';

export function getQueryCacheKey(query: { type: string; [key: string]: unknown }): string {
    const { type, ...params } = query;
    const paramKeys = Object.keys(params).sort();
    if (paramKeys.length === 0) {
        return type;
    }
    const ordered: Record<string, unknown> = {};
    for (const k of paramKeys) {
        ordered[k] = params[k];
    }
    return `${type}:${JSON.stringify(ordered)}`;
}

let cachedTick = 0;
const cache = new Map<string, Promise<unknown>>();

interface CacheMetrics {
    hits: number;
    misses: number;
}

let metrics: Map<string, CacheMetrics> | null = SIM_DEBUG ? new Map() : null;

function logMetrics(tick: number): void {
    if (!metrics || metrics.size === 0) {
        return;
    }

    let totalHits = 0;
    let totalMisses = 0;

    // Sort keys for stable output
    const sorted = [...metrics.entries()].sort(([a], [b]) => a.localeCompare(b));

    for (const [, m] of sorted) {
        totalHits += m.hits;
        totalMisses += m.misses;
    }

    const total = totalHits + totalMisses;
    const pct = total > 0 ? ((totalHits / total) * 100).toFixed(1) : '0.0';

    console.log(`[cache] Tick ${tick} — ${total} queries, ${totalHits} hits (${pct}%), ${totalMisses} misses`);

    const keyPad = Math.max(...sorted.map(([k]) => k.length), 0) + 2;
    for (const [key, m] of sorted) {
        const pctKey = m.hits + m.misses > 0 ? ((m.hits / (m.hits + m.misses)) * 100).toFixed(1) : '0.0';
        console.log(
            `  ${key.padEnd(keyPad)} │ hits: ${String(m.hits).padStart(3)} │ miss: ${String(m.misses).padStart(3)} │ total: ${String(m.hits + m.misses).padStart(3)} │ ${pctKey}%`,
        );
    }
}

function recordHit(key: string): void {
    if (!metrics) {
        return;
    }
    let m = metrics.get(key);
    if (!m) {
        m = { hits: 0, misses: 0 };
        metrics.set(key, m);
    }
    m.hits++;
}

function recordMiss(key: string): void {
    if (!metrics) {
        return;
    }
    let m = metrics.get(key);
    if (!m) {
        m = { hits: 0, misses: 0 };
        metrics.set(key, m);
    }
    m.misses++;
}

function ensureTickIsCurrent(): void {
    const tick = getLatestTick();
    if (tick !== cachedTick) {
        if (SIM_DEBUG) {
            logMetrics(cachedTick);
            metrics = new Map();
        }
        cache.clear();
        cachedTick = tick;
    }
}

export function getCachedOrCompute<T>(key: string, computer: () => Promise<T>): Promise<T> {
    ensureTickIsCurrent();

    const existing = cache.get(key);
    if (existing) {
        recordHit(key);
        return existing as Promise<T>;
    }

    recordMiss(key);

    const promise = computer().finally(() => {
        // Keep resolved values in cache for the rest of this tick.
        // Only evict on rejection so retries are possible.
    });
    promise.catch(() => {
        cache.delete(key);
    });

    cache.set(key, promise);
    return promise;
}
