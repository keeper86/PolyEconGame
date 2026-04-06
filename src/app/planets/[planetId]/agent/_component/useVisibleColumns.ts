'use client';

import { useEffect, useState, useRef } from 'react';
import type { ColumnConfig } from './columnConfig';
import { getVisibleColumns as getVisibleColumnsFromConfig } from './columnConfig';

/**
 * Hook to get visible columns based on container width.
 * @param containerRef - ref to the container element to observe
 * @param overhead - fixed pixel amount to subtract from the container width before
 *                   calculating columns (accounts for icon, name, padding, chevron)
 */
export function useVisibleColumns(containerRef: React.RefObject<HTMLElement | null>, overhead = 0): ColumnConfig[] {
    const [visibleColumns, setVisibleColumns] = useState<ColumnConfig[]>([]);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);

    useEffect(() => {
        if (!containerRef.current) {
            return;
        }

        const updateVisibleColumns = () => {
            if (containerRef.current) {
                const columnSpace = Math.max(0, containerRef.current.clientWidth - overhead);
                const visible = getVisibleColumnsFromConfig(columnSpace);
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
    }, [containerRef, overhead]);

    return visibleColumns;
}
