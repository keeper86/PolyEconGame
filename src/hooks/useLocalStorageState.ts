'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

type Listener = () => void;

interface LocalStorageStore<T> {
    key: string;
    value: T;
    fallback: T;
    isValid: (raw: unknown) => raw is T;
    hydrated: boolean;
    listeners: Set<Listener>;
}

const stores = new Map<string, LocalStorageStore<unknown>>();

export function resetLocalStorageStores(): void {
    stores.clear();
}

function getStore<T>(key: string, fallback: T, isValid: (raw: unknown) => raw is T): LocalStorageStore<T> {
    let store = stores.get(key) as LocalStorageStore<T> | undefined;
    if (!store) {
        store = {
            key,
            value: fallback,
            fallback,
            isValid,
            hydrated: false,
            listeners: new Set(),
        };
        stores.set(key, store as LocalStorageStore<unknown>);
    }
    return store;
}

function readStoredValue<T>(store: LocalStorageStore<T>): T | undefined {
    try {
        const raw = localStorage.getItem(store.key);
        if (raw === null) {
            return undefined;
        }
        const parsed: unknown = JSON.parse(raw);
        if (!store.isValid(parsed)) {
            return undefined;
        }
        return parsed;
    } catch {
        return undefined;
    }
}

function notifyListeners(store: LocalStorageStore<unknown>): void {
    for (const listener of store.listeners) {
        listener();
    }
}

function reloadFromStorage(store: LocalStorageStore<unknown>): void {
    const stored = readStoredValue(store);
    if (stored === undefined || store.value === stored) {
        return;
    }
    store.value = stored;
    notifyListeners(store);
}

let storageListenerAttached = false;

function attachStorageListener(): void {
    if (storageListenerAttached || typeof window === 'undefined') {
        return;
    }
    storageListenerAttached = true;
    window.addEventListener('storage', (event) => {
        const store = stores.get(event.key ?? '');
        if (store) {
            reloadFromStorage(store);
        }
    });
}

export function useLocalStorageState<T>(
    key: string,
    fallback: T,
    isValid: (raw: unknown) => raw is T,
): [T, (next: T | ((prev: T) => T)) => void] {
    const store = getStore(key, fallback, isValid);

    const getSnapshot = useCallback(() => store.value, [store]);
    const getServerSnapshot = useCallback(() => store.fallback, [store]);
    const subscribe = useCallback(
        (listener: Listener) => {
            store.listeners.add(listener);
            return () => {
                store.listeners.delete(listener);
            };
        },
        [store],
    );

    const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    useEffect(() => {
        attachStorageListener();
        if (store.hydrated) {
            return;
        }
        store.hydrated = true;
        reloadFromStorage(store);
    }, [store]);

    const setValue = useCallback(
        (next: T | ((prev: T) => T)) => {
            const resolved = typeof next === 'function' ? (next as (prev: T) => T)(store.value) : next;
            if (resolved === store.value) {
                return;
            }
            store.value = resolved;
            notifyListeners(store);
            try {
                localStorage.setItem(store.key, JSON.stringify(resolved));
            } catch {
                // Silently ignore storage errors
            }
        },
        [store],
    );

    return [value, setValue];
}
