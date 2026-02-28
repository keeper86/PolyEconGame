/**
 * Shared constants, helpers, and types for the Workforce Demography panel family.
 */

import type { EducationLevelType } from '../../simulation/planet';
import { educationLevelKeys, educationLevels } from '../../simulation/planet';

// ---------------------------------------------------------------------------
// Education-level colour palette
// ---------------------------------------------------------------------------

/**
 * Consistent colour tokens per education level.
 * Each entry provides a Tailwind-friendly set of classes for badges,
 * table cells, and chart strokes / fills.
 */
export const EDU_COLORS: Record<EducationLevelType, { badge: string; text: string; chart: string }> = {
    none: { badge: 'border-slate-300 bg-slate-50 text-slate-700', text: 'text-slate-600', chart: '#94a3b8' },
    primary: { badge: 'border-blue-300 bg-blue-50 text-blue-700', text: 'text-blue-600', chart: '#60a5fa' },
    secondary: {
        badge: 'border-emerald-300 bg-emerald-50 text-emerald-700',
        text: 'text-emerald-600',
        chart: '#34d399',
    },
    tertiary: { badge: 'border-amber-300 bg-amber-50 text-amber-700', text: 'text-amber-600', chart: '#f59e0b' },
    quaternary: { badge: 'border-violet-300 bg-violet-50 text-violet-700', text: 'text-violet-600', chart: '#8b5cf6' },
};

/** Ordered chart fill colours matching the education level order. */
export const EDU_CHART_COLORS: string[] = educationLevelKeys.map((edu) => EDU_COLORS[edu].chart);

// ---------------------------------------------------------------------------
// Chart colour constants (non-education)
// ---------------------------------------------------------------------------

export const CHART_COLORS = {
    active: '#60a5fa',
    departing: '#f97316',
} as const;

/** Tenure-band area-chart colours. */
export const TENURE_BAND_COLORS = ['#93c5fd', '#60a5fa', '#34d399', '#f59e0b', '#ef4444'];

/**
 * Generate a smooth colour for a tenure year index.
 * Maps `t ∈ [0, maxYears]` through an HSL gradient:
 *   hue 210 (blue) → 0 (red), saturation 75%, lightness 55%.
 */
export function tenureYearColor(index: number, total: number): string {
    const t = total > 1 ? index / (total - 1) : 0;
    const hue = 210 - t * 210; // 210 (blue) → 0 (red)
    return `hsl(${Math.round(hue)}, 75%, 55%)`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Human-readable label for an education level key. */
export const eduLabel = (edu: EducationLevelType): string => educationLevels[edu].name;

/** Format large numbers with locale-aware separators. */
export const fmt = (n: number): string => n.toLocaleString();

/** Sum a Record<EducationLevelType, number> across all education levels. */
export const sumByEdu = (rec: Record<EducationLevelType, number>): number =>
    educationLevelKeys.reduce((sum, edu) => sum + (rec[edu] ?? 0), 0);

/** Format a percentage, safe for zero denominators. */
export const pct = (num: number, den: number): string => (den > 0 ? ((num / den) * 100).toFixed(0) : '0');
