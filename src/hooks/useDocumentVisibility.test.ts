import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDocumentVisibility } from './useDocumentVisibility';

const setVisibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
};

const dispatchVisibilityChange = () => {
    document.dispatchEvent(new Event('visibilitychange'));
};

describe('useDocumentVisibility', () => {
    afterEach(() => {
        setVisibility('visible');
    });

    it('calls onHide on mount when the document is hidden', () => {
        const onHide = vi.fn();
        const onShow = vi.fn();
        setVisibility('hidden');

        renderHook(() => useDocumentVisibility(onHide, onShow));

        expect(onHide).toHaveBeenCalledTimes(1);
        expect(onShow).not.toHaveBeenCalled();
    });

    it('calls onShow on mount when the document is visible', () => {
        const onHide = vi.fn();
        const onShow = vi.fn();
        setVisibility('visible');

        renderHook(() => useDocumentVisibility(onHide, onShow));

        expect(onShow).toHaveBeenCalledTimes(1);
        expect(onHide).not.toHaveBeenCalled();
    });

    it('reacts to visibility changes after mount', () => {
        const onHide = vi.fn();
        const onShow = vi.fn();
        setVisibility('visible');

        renderHook(() => useDocumentVisibility(onHide, onShow));
        onHide.mockClear();
        onShow.mockClear();

        setVisibility('hidden');
        dispatchVisibilityChange();
        expect(onHide).toHaveBeenCalledTimes(1);

        setVisibility('visible');
        dispatchVisibilityChange();
        expect(onShow).toHaveBeenCalledTimes(1);
    });

    it('stops listening after unmount', () => {
        const onHide = vi.fn();
        const onShow = vi.fn();
        setVisibility('visible');

        const { unmount } = renderHook(() => useDocumentVisibility(onHide, onShow));
        onHide.mockClear();
        onShow.mockClear();

        unmount();
        setVisibility('hidden');
        dispatchVisibilityChange();

        expect(onHide).not.toHaveBeenCalled();
        expect(onShow).not.toHaveBeenCalled();
    });
});
