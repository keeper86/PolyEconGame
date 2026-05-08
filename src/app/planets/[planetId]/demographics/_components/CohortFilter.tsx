'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { EducationLevelType } from '@/simulation/population/education';
import { educationLevelKeys } from '@/simulation/population/education';
import type { Occupation } from '@/simulation/population/population';
import { OCCUPATIONS } from '@/simulation/population/population';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type CohortFilterState = {
    /** Selected education level, or null for "all" (marginalised). */
    edu: EducationLevelType | null;
    /** Selected occupation, or null for "all" (marginalised). */
    occ: Occupation | null;
};

type Props = {
    value: CohortFilterState;
    onChange: (next: CohortFilterState) => void;
    /** Compact mode: smaller badges, single row */
    compact?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * CohortFilter — badge-based selector for education × occupation filtering.
 *
 * Users can select:
 * - Nothing → aggregate view (all edu, all occ)
 * - 1 edu → marginalise over all occupations for that education level
 * - 1 edu + 1 occ → single cohort-class
 *
 * Clicking the already-selected badge deselects it.
 */
export default function CohortFilter({ value, onChange, compact }: Props): React.ReactElement {
    const toggleEdu = (edu: EducationLevelType) => {
        if (value.edu === edu) {
            // Deselect education → also deselect occupation
            onChange({ edu: null, occ: null });
        } else {
            onChange({ edu, occ: value.occ });
        }
    };

    const toggleOcc = (occ: Occupation) => {
        if (value.occ === occ) {
            onChange({ edu: value.edu, occ: null });
        } else {
            onChange({ edu: value.edu, occ });
        }
    };

    const badgeSizeClass = compact ? 'text-[10px] px-1.5 py-0' : 'text-[11px] px-2 py-0.5';

    return (
        <div className={cn('flex flex-col gap-1', compact && 'gap-0.5')}>
            {/* Education row */}
            <div className='flex items-center gap-1 flex-wrap'>
                <span className='text-[10px] text-muted-foreground w-8 shrink-0'>Edu</span>
                {educationLevelKeys.map((edu) => {
                    const selected = value.edu === edu;
                    return (
                        <Badge
                            key={edu}
                            variant={selected ? 'default' : 'outline'}
                            className={cn(
                                badgeSizeClass,
                                'cursor-pointer select-none transition-all',
                                selected && 'ring-1 ring-offset-1',
                            )}
                            style={
                                selected
                                    ? { backgroundColor: EDU_COLORS[edu], borderColor: EDU_COLORS[edu], color: '#fff' }
                                    : { borderColor: EDU_COLORS[edu], color: EDU_COLORS[edu] }
                            }
                            onClick={() => {
                                toggleEdu(edu);
                            }}
                        >
                            {EDU_LABELS[edu]}
                        </Badge>
                    );
                })}
            </div>

            {/* Occupation row */}
            <div className='flex items-center gap-1 flex-wrap'>
                <span className='text-[10px] text-muted-foreground w-8 shrink-0'>Occ</span>
                {OCCUPATIONS.map((occ) => {
                    const selected = value.occ === occ;
                    return (
                        <Badge
                            key={occ}
                            variant={selected ? 'default' : 'outline'}
                            className={cn(
                                badgeSizeClass,
                                'cursor-pointer select-none transition-all',
                                selected && 'ring-1 ring-offset-1',
                            )}
                            style={
                                selected
                                    ? { backgroundColor: OCC_COLORS[occ], borderColor: OCC_COLORS[occ], color: '#fff' }
                                    : { borderColor: OCC_COLORS[occ], color: OCC_COLORS[occ] }
                            }
                            onClick={() => {
                                toggleOcc(occ);
                            }}
                        >
                            {OCC_LABELS[occ]}
                        </Badge>
                    );
                })}
            </div>
        </div>
    );
}
