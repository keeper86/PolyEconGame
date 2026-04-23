'use client';

import React from 'react';
import type { EducationLevelType } from '@/simulation/population/education';
import { educationLevels } from '@/simulation/population/education';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatNumbers } from '@/lib/utils';
import { EDU_COLORS } from '../../../_component/workforce-theme';

export const pctStr = (frac: number): string => `${Math.round(frac * 100)}%`;

function fillColor(efficiency: number, isLimiting: boolean): string {
    if (isLimiting) {
        return 'bg-red-500/40';
    }
    if (efficiency < 0.95) {
        return 'bg-amber-400/40';
    }
    return 'bg-green-500/40';
}

function borderColor(efficiency: number, isLimiting: boolean): string {
    if (isLimiting) {
        return 'border border-red-500';
    }
    if (efficiency < 0.95) {
        return 'border border-amber-400';
    }
    return 'border border-green-500';
}

export function WorkerBars({
    workerRequirement,
    scale,
    workerEfficiency,
    globalMin,
}: {
    workerRequirement: Partial<Record<EducationLevelType, number>>;
    scale: number;
    workerEfficiency: Partial<Record<EducationLevelType, number>>;
    globalMin: number;
}): React.ReactElement | null {
    const entries = (Object.entries(workerRequirement) as [EducationLevelType, number | undefined][]).filter(
        ([, req]) => req && req > 0,
    );

    if (entries.length === 0) {
        return null;
    }

    return (
        <div className='flex flex-col gap-2 mb-3'>
            {entries.map(([edu, req]) => {
                const required = (req ?? 0) * scale;
                const eff = workerEfficiency[edu] ?? 1;
                const isLimiting = eff <= globalMin && globalMin < 0.99;

                return (
                    <Tooltip key={edu}>
                        <TooltipTrigger asChild>
                            <div
                                className={`relative flex items-center rounded bg-muted overflow-hidden border-l-2 ${EDU_COLORS[edu].text} cursor-default ${borderColor(eff, isLimiting)}`}
                            >
                                <span
                                    className={`absolute inset-y-0 left-0 ${fillColor(eff, isLimiting)} transition-all`}
                                    style={{ width: `${Math.round(eff * 100)}%` }}
                                />
                                <span className='relative z-10 flex items-center justify-between w-full px-2 py-0.5 text-xs text-outline-strong'>
                                    <span>{educationLevels[edu].name}</span>
                                    <span className='tabular-nums'>{formatNumbers(required)}</span>
                                </span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side='top'>
                            {educationLevels[edu].name} workers: {pctStr(eff)} efficiency
                        </TooltipContent>
                    </Tooltip>
                );
            })}
        </div>
    );
}
