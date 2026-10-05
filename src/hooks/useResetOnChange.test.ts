import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useResetOnChange } from './useResetOnChange';

describe('useResetOnChange', () => {
    it('does not reset on mount', () => {
        const onReset = vi.fn();

        renderHook(({ key }) => useResetOnChange(key, onReset), { initialProps: { key: 'a' } });

        expect(onReset).not.toHaveBeenCalled();
    });

    it('does not reset while the key is unchanged', () => {
        const onReset = vi.fn();
        const { rerender } = renderHook(({ key }) => useResetOnChange(key, onReset), { initialProps: { key: 'a' } });

        rerender({ key: 'a' });

        expect(onReset).not.toHaveBeenCalled();
    });

    it('resets once when the key changes', () => {
        const onReset = vi.fn();
        const { rerender } = renderHook(({ key }) => useResetOnChange(key, onReset), { initialProps: { key: 'a' } });

        rerender({ key: 'b' });

        expect(onReset).toHaveBeenCalledTimes(1);
    });

    it('resets again on each further change', () => {
        const onReset = vi.fn();
        const { rerender } = renderHook(({ key }) => useResetOnChange(key, onReset), { initialProps: { key: 'a' } });

        rerender({ key: 'b' });
        rerender({ key: 'b' });
        rerender({ key: 'c' });

        expect(onReset).toHaveBeenCalledTimes(2);
    });
});
