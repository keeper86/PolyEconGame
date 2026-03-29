'use client';

import { useEffect, useState, useRef } from 'react';
import type { ColumnConfig } from './columnConfig';
import { getVisibleColumns as getVisibleColumnsFromConfig } from './columnConfig';

/**
 * Hook to get visible columns based on container width
 */
export function useVisibleColumns(containerRef: React.RefObject<HTMLElement | null>): ColumnConfig[] {
    const [visibleColumns, setVisibleColumns] = useState<ColumnConfig[]>([]);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);

    useEffect(() => {
        if (!containerRef.current) {
            return;
        }

        const updateVisibleColumns = () => {
            if (containerRef.current) {
                const containerWidth = containerRef.current.clientWidth;
                const visible = getVisibleColumnsFromConfig(containerWidth);
                setVisibleColumns(visible);
            }
        };

        // Initial update
        updateVisibleColumns();

        // Set up resize observer
        resizeObserverRef.current = new ResizeObserver(updateVisibleColumns);
        resizeObserverRef.current.observe(containerRef.current);

        return () => {
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect();
            }
        };
    }, [containerRef]);

    return visibleColumns;
}

/**
 * Simple hook for components that don't have a direct container ref
 * Uses window width as a fallback (less precise but works)
 */
export function useVisibleColumnsFallback(): ColumnConfig[] {
    const [visibleColumns, setVisibleColumns] = useState<ColumnConfig[]>([]);

    useEffect(() => {
        const updateVisibleColumns = () => {
            // Estimate available width as window width minus some padding
            const estimatedWidth = window.innerWidth - 100; // Account for some padding/margins
            const visible = getVisibleColumnsFromConfig(estimatedWidth);
            setVisibleColumns(visible);
        };

        // Initial update
        updateVisibleColumns();

        // Listen to window resize
        window.addEventListener('resize', updateVisibleColumns);

        return () => {
            window.removeEventListener('resize', updateVisibleColumns);
        };
    }, []);

    return visibleColumns;
}
