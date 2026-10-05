'use client';

import { useCallback, useEffect, useState } from 'react';

export function useFullscreen(): { isFullscreen: boolean; toggleFullscreen: () => Promise<void> } {
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleChange);
        return () => document.removeEventListener('fullscreenchange', handleChange);
    }, []);

    const toggleFullscreen = useCallback(async () => {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch (err) {
            console.error('Fullscreen failed:', err);
        }
    }, []);

    return { isFullscreen, toggleFullscreen };
}
