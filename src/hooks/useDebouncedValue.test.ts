import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue';

const renderDebounced = (initial: string) =>
    renderHook(({ value }: { value: string }) => useDebouncedValue(value, 200), { initialProps: { value: initial } });

describe('useDebouncedValue', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns the initial value immediately', () => {
        const { result } = renderDebounced('a');

        expect(result.current).toBe('a');
    });

    it('only updates once the delay has elapsed', async () => {
        vi.useFakeTimers();
        const { result, rerender } = renderDebounced('a');

        rerender({ value: 'b' });
        expect(result.current).toBe('a');

        await act(async () => {
            vi.advanceTimersByTime(199);
        });
        expect(result.current).toBe('a');

        await act(async () => {
            vi.advanceTimersByTime(1);
        });
        expect(result.current).toBe('b');
    });

    it('restarts the timer when the value changes again', async () => {
        vi.useFakeTimers();
        const { result, rerender } = renderDebounced('a');

        rerender({ value: 'b' });
        await act(async () => {
            vi.advanceTimersByTime(100);
        });
        rerender({ value: 'c' });
        await act(async () => {
            vi.advanceTimersByTime(100);
        });
        expect(result.current).toBe('a');

        await act(async () => {
            vi.advanceTimersByTime(100);
        });
        expect(result.current).toBe('c');
    });
});
