import type { EducationLevelType } from '@/simulation/population/education';
import { educationLevelKeys, educationLevels } from '@/simulation/population/education';

export const EDU_COLORS: Record<EducationLevelType, { badge: string; text: string; chart: string }> = {
    none: { badge: 'border-slate-300 bg-slate-50 text-slate-700', text: 'text-slate-600', chart: '#94a3b8' },
    primary: { badge: 'border-blue-300 bg-blue-50 text-blue-700', text: 'text-blue-600', chart: '#60a5fa' },
    secondary: {
        badge: 'border-emerald-300 bg-emerald-50 text-emerald-700',
        text: 'text-emerald-600',
        chart: '#34d399',
    },
    tertiary: { badge: 'border-amber-300 bg-amber-50 text-amber-700', text: 'text-amber-600', chart: '#f59e0b' },
};

export const EDU_CHART_COLORS: string[] = educationLevelKeys.map((edu) => EDU_COLORS[edu].chart);

export const CHART_COLORS = {
    active: '#60a5fa',
    departing: '#f97316',
} as const;

export const DEPARTURE_COLORS = {
    quitting: '#facc15',
    fired: '#ef4444',
    retired: '#a3e635',
} as const;

export const TENURE_BAND_COLORS = ['#93c5fd', '#60a5fa', '#34d399', '#f59e0b', '#ef4444'];

export function tenureYearColor(index: number, total: number): string {
    const t = total > 1 ? index / (total - 1) : 0;
    const hue = 210 - t * 210;
    return `hsl(${Math.round(hue)}, 75%, 55%)`;
}

export const eduLabel = (edu: EducationLevelType): string => educationLevels[edu].name;

export const sumByEdu = (rec: Partial<Record<EducationLevelType, number>>): number =>
    educationLevelKeys.reduce((sum, edu) => sum + (rec[edu] ?? 0), 0);

export const pct = (num: number, den: number): string => (den > 0 ? ((num / den) * 100).toFixed(0) : '0');
