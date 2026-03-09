'use client';

import React from 'react';
import TransferChart from './TransferChart';
import type { Population } from '@/simulation/population/population';
import { OCCUPATIONS, SKILL } from '@/simulation/population/population';
import { educationLevelKeys } from '@/simulation/population/education';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type Props = {
    population: Population;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * IntergenerationalTransferChart — renders a TransferChart for all
 * kernel-based transfers (same-age peer/spousal support and cross-age
 * intergenerational transfers) using the unified asymmetric kernel.
 *
 * Supports occupation / education stacking and skill-level filtering
 * with autoscaled Y-axis to the total (all-skills) domain.
 */
export default function IntergenerationalTransferChart({ population }: Props): React.ReactElement {
    const matrix = population.lastVerticalTransferMatrix;

    // Compute per-age totals from the skill-aware transfer matrix and derive
    // a symmetric bound (±max(|min|, |max|)). The `matrix` here is a
    // SkillTransferMatrix: age -> edu -> occ -> skill.
    let min = 0;
    let max = 0;
    let found = false;
    if (Array.isArray(matrix) && matrix.length > 0) {
        for (let age = 0; age < matrix.length; age++) {
            const cohort = matrix[age];
            let total = 0;
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    for (const skill of SKILL) {
                        const v = cohort?.[edu]?.[occ]?.[skill];
                        if (typeof v === 'number') {
                            total += v;
                        }
                    }
                }
            }
            if (!found) {
                min = total;
                max = total;
                found = true;
            } else {
                if (total < min) {
                    min = total;
                }
                if (total > max) {
                    max = total;
                }
            }
        }
    }
    if (!found) {
        min = 0;
        max = 0;
    }

    // symmetric bound: use the larger absolute value of extrema. If bound
    // would be zero, keep a small epsilon so the axis renders.
    const bound = Math.max(Math.abs(min), Math.abs(max), 0);
    const yMin = -bound * 1.05 || -1;
    const yMax = bound * 1.05 || 1;

    return (
        <div className='space-y-6'>
            <TransferChart title='Intergenerational transfers' matrix={matrix} yMin={yMin} yMax={yMax} />
        </div>
    );
}
