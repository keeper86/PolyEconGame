import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFullscreen } from './useFullscreen';

const requestFullscreen = vi.fn();
const exitFullscreen = vi.fn();

const setFullscreenElement = (element: Element | null) => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
};

describe('useFullscreen', () => {
    beforeEach(() => {
        setFullscreenElement(null);
        requestFullscreen.mockReset().mockResolvedValue(undefined);
        exitFullscreen.mockReset().mockResolvedValue(undefined);
        Object.defineProperty(document.documentElement, 'requestFullscreen', {
            configurable: true,
            value: requestFullscreen,
        });
        Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen });
    });

    it('requests fullscreen when the document is not in fullscreen', async () => {
        const { result } = renderHook(() => useFullscreen());

        await act(async () => {
            await result.current.toggleFullscreen();
        });

        expect(requestFullscreen).toHaveBeenCalledTimes(1);
        expect(exitFullscreen).not.toHaveBeenCalled();
    });

    it('exits fullscreen when the document is already in fullscreen', async () => {
        setFullscreenElement(document.documentElement);
        const { result } = renderHook(() => useFullscreen());

        await act(async () => {
            await result.current.toggleFullscreen();
        });

        expect(exitFullscreen).toHaveBeenCalledTimes(1);
        expect(requestFullscreen).not.toHaveBeenCalled();
    });

    it('tracks the fullscreen state from the fullscreenchange event', () => {
        const { result } = renderHook(() => useFullscreen());
        expect(result.current.isFullscreen).toBe(false);

        act(() => {
            setFullscreenElement(document.documentElement);
            document.dispatchEvent(new Event('fullscreenchange'));
        });

        expect(result.current.isFullscreen).toBe(true);
    });

    it('removes the fullscreenchange listener on unmount', () => {
        const removeListener = vi.spyOn(document, 'removeEventListener');
        const { unmount } = renderHook(() => useFullscreen());

        unmount();

        expect(removeListener).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
        removeListener.mockRestore();
    });

    it('swallows errors thrown by the fullscreen API', async () => {
        requestFullscreen.mockRejectedValueOnce(new Error('not allowed'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { result } = renderHook(() => useFullscreen());

        await act(async () => {
            await result.current.toggleFullscreen();
        });

        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});
