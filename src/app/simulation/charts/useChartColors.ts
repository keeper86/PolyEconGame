'use client';

import { useEffect, useState } from 'react';

interface ChartColors {
    primary: string;
    destructive: string;
    border: string;
    muted: string;
}

const FALLBACK: ChartColors = {
    primary: '#3b82f6',
    destructive: '#ef4444',
    border: '#e5e7eb',
    muted: '#9ca3af',
};

function resolveVar(name: string): string {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!raw) {
        return '';
    }
    return `hsl(${raw})`;
}

export function useChartColors(): ChartColors {
    const [colors, setColors] = useState<ChartColors>(FALLBACK);

    useEffect(() => {
        setColors({
            primary: resolveVar('--primary') || FALLBACK.primary,
            destructive: resolveVar('--destructive') || FALLBACK.destructive,
            border: resolveVar('--border') || FALLBACK.border,
            muted: resolveVar('--muted-foreground') || FALLBACK.muted,
        });
    }, []);

    return colors;
}
