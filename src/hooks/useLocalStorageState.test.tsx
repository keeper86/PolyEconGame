import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetLocalStorageStores, useLocalStorageState } from './useLocalStorageState';

const TEST_KEY = 'polyecon:test:boolean';

const isBoolean = (raw: unknown): raw is boolean => typeof raw === 'boolean';

function renderBooleanState() {
    return renderHook(() => useLocalStorageState(TEST_KEY, false, isBoolean));
}

describe('useLocalStorageState', () => {
    beforeEach(() => {
        localStorage.clear();
        resetLocalStorageStores();
    });

    it('returns the fallback when localStorage has no entry', () => {
        const { result } = renderBooleanState();
        expect(result.current[0]).toBe(false);
    });

    it('persists a new value to localStorage', () => {
        const { result } = renderBooleanState();
        act(() => result.current[1](true));
        expect(JSON.parse(localStorage.getItem(TEST_KEY) ?? 'null')).toBe(true);
    });

    it('hydrates from a stored valid value', () => {
        localStorage.setItem(TEST_KEY, JSON.stringify(true));
        const { result } = renderBooleanState();
        expect(result.current[0]).toBe(true);
    });

    it('ignores a stored value that fails validation', () => {
        localStorage.setItem(TEST_KEY, JSON.stringify('not-a-boolean'));
        const { result } = renderBooleanState();
        expect(result.current[0]).toBe(false);
    });

    it('ignores unparseable JSON', () => {
        localStorage.setItem(TEST_KEY, '{not-json');
        const { result } = renderBooleanState();
        expect(result.current[0]).toBe(false);
    });

    it('keeps two hook instances for the same key in sync', () => {
        const first = renderBooleanState();
        const second = renderBooleanState();
        act(() => first.result.current[1](true));
        expect(first.result.current[0]).toBe(true);
        expect(second.result.current[0]).toBe(true);
    });

    it('reloads from a storage event fired by another tab', () => {
        const { result } = renderBooleanState();
        act(() => result.current[1](true));
        act(() => {
            localStorage.setItem(TEST_KEY, JSON.stringify(false));
            window.dispatchEvent(new StorageEvent('storage', { key: TEST_KEY, newValue: JSON.stringify(false) }));
        });
        expect(result.current[0]).toBe(false);
    });

    it('applies an updater function against the current value', () => {
        const { result } = renderBooleanState();
        act(() => result.current[1](true));
        act(() => result.current[1]((prev) => !prev));
        expect(result.current[0]).toBe(false);
        expect(JSON.parse(localStorage.getItem(TEST_KEY) ?? 'null')).toBe(false);
    });

    it('applies two sequential updater calls without dropping an update', () => {
        const { result } = renderBooleanState();
        act(() => result.current[1](true));
        act(() => {
            result.current[1]((prev) => !prev);
            result.current[1]((prev) => !prev);
        });
        expect(result.current[0]).toBe(true);
    });

    it('keeps the in-memory value when localStorage.setItem throws', () => {
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota exceeded');
        });
        try {
            const { result } = renderBooleanState();
            act(() => result.current[1](true));
            expect(result.current[0]).toBe(true);
        } finally {
            setItemSpy.mockRestore();
        }
    });
});
