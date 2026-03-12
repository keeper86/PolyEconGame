'use client';

import { educationLevelKeys } from '@/simulation/population/education';
import { OCCUPATIONS } from '@/simulation/population/population';
import type { PopulationTransferMatrix } from '@/simulation/population/population';
import React from 'react';
import TransferChart from './TransferChart';

type Props = {
    lastTransferMatrix: PopulationTransferMatrix;
};

export default function IntergenerationalTransferChart({ lastTransferMatrix }: Props): React.ReactElement {
    const matrix = lastTransferMatrix;

    let min = 0;
    let max = 0;
    let found = false;
    if (Array.isArray(matrix) && matrix.length > 0) {
        for (let age = 0; age < matrix.length; age++) {
            const cohort = matrix[age];
            let total = 0;
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    const v = cohort?.[edu]?.[occ];
                    if (typeof v === 'number') {
                        total += v;
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

    const bound = Math.max(Math.abs(min), Math.abs(max), 0);
    const yMin = -bound * 1.05 || -1;
    const yMax = bound * 1.05 || 1;

    return (
        <div className='space-y-6'>
            <TransferChart title='Intergenerational transfers' matrix={matrix} yMin={yMin} yMax={yMax} />
        </div>
    );
}
