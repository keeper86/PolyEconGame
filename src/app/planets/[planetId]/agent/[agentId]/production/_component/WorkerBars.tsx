'use client';

import React from 'react';
import type { EducationLevelType } from '@/simulation/population/education';
import { educationLevels } from '@/simulation/population/education';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatNumberWithUnit } from '@/lib/utils';
import { EDU_COLORS } from '@/app/planets/[planetId]/agent/[agentId]/workforce/_component/workforceTheme';
import { borderColor, fillColor } from '@/components/client/ProductQuantity';

export const pctStr = (frac: number): string => `${Math.round(frac * 100)}%`;

export function WorkerBars({
    workerRequirement,
    scale,
    neutral,
    workerEfficiency,
    globalMin,
}: {
    workerRequirement: Partial<Record<EducationLevelType, number>>;
    scale: number;
    neutral?: boolean;
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
                const eff = (workerEfficiency[edu] ?? neutral) ? 1 : 0;
                const isLimiting = eff <= globalMin && globalMin < 0.99;

                return (
                    <Tooltip key={edu}>
                        <TooltipTrigger asChild>
                            <div
                                className={`relative flex items-center rounded bg-muted overflow-hidden border-l-2 ${EDU_COLORS[edu].text} cursor-default ${borderColor(eff, isLimiting, neutral)}`}
                            >
                                <span
                                    className={`absolute inset-y-0 left-0 ${fillColor(eff, isLimiting, neutral)} transition-all`}
                                    style={{ width: `${Math.round(eff * 100)}%` }}
                                />
                                <span className='relative z-10 flex items-center justify-between w-full px-2 py-0.5 text-xs text-outline-strong'>
                                    <span>{educationLevels[edu].name}</span>
                                    <span className='tabular-nums'>
                                        {formatNumberWithUnit(Math.round(eff * required), 'persons')}
                                    </span>
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
