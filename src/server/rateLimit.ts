export function rateLimitExceeded(
    store: Map<string, number[]>,
    key: string,
    limit: number,
    windowMs: number,
    now: number = Date.now(),
): boolean {
    const cutoff = now - windowMs;
    const recent = (store.get(key) ?? []).filter((timestamp) => timestamp > cutoff);

    if (recent.length >= limit) {
        store.set(key, recent);
        return true;
    }

    recent.push(now);
    store.set(key, recent);
    return false;
}
