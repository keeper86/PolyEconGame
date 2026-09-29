'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { EducationLevelType } from '@/simulation/population/education';
import type { Occupation } from '@/simulation/population/population';

export const EDU_COLORS: Record<EducationLevelType, string> = {
    none: '#94a3b8',
    primary: '#60a5fa',
    secondary: '#34d399',
    tertiary: '#f59e0b',
};

export const OCC_COLORS: Record<Occupation, string> = {
    unoccupied: '#60a5fa',
    employed: '#34d399',
    education: '#f97316',
    unableToWork: '#ef4444',
};

type CohortLabels = {
    edu: Record<EducationLevelType, string>;
    occ: Record<Occupation, string>;
};

export const useCohortLabels = (): CohortLabels => {
    const t = useTranslations('Demographics');
    return useMemo(
        () => ({
            edu: {
                none: t('eduNone'),
                primary: t('eduPrimary'),
                secondary: t('eduSecondary'),
                tertiary: t('eduTertiary'),
            },
            occ: {
                unoccupied: t('occUnoccupied'),
                employed: t('occEmployed'),
                education: t('occEducation'),
                unableToWork: t('occUnableToWork'),
            },
        }),
        [t],
    );
};
