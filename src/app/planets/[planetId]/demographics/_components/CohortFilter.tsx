'use client';

import type { EducationLevelType } from '@/simulation/population/education';
import type { Occupation } from '@/simulation/population/population';

export const EDU_COLORS: Record<EducationLevelType, string> = {
    none: '#94a3b8',
    primary: '#60a5fa',
    secondary: '#34d399',
    tertiary: '#f59e0b',
};

export const EDU_LABELS: Record<EducationLevelType, string> = {
    none: 'None',
    primary: 'Primary',
    secondary: 'Secondary',
    tertiary: 'Tertiary',
};

export const OCC_COLORS: Record<Occupation, string> = {
    unoccupied: '#60a5fa',
    employed: '#34d399',
    education: '#f97316',
    unableToWork: '#ef4444',
};

export const OCC_LABELS: Record<Occupation, string> = {
    unoccupied: 'Unoccupied',
    employed: 'Employed',
    education: 'Education',
    unableToWork: 'Unable to work',
};
