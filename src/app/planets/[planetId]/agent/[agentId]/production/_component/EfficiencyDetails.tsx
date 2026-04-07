'use client';

import React, { useState } from 'react';
import type { LastProductionTickResults } from '../../../../../../../simulation/planet/facility';
import type { EducationLevelType } from '@/simulation/population/education';
import { educationLevels } from '@/simulation/population/education';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const efficiencyColor = (frac: number): string => {
    if (frac >= 0.9) {
        return 'text-green-600';
    }
    if (frac >= 0.5) {
        return 'text-amber-500';
    }
    return 'text-red-500';
};

export const pctStr = (frac: number): string => `${Math.round(frac * 100)}%`;

const eduLabel = (edu: EducationLevelType): string => educationLevels[edu].name;

export function EfficiencyDetails({ results }: { results: LastProductionTickResults }): React.ReactElement {
    const [open, setOpen] = useState(false);
    const workerEntries = Object.entries(results.workerEfficiency) as [EducationLevelType, number][];
    const resourceEntries = Object.entries(results.resourceEfficiency);
    const overqualifiedEntries = Object.entries(results.overqualifiedWorkers) as [
        EducationLevelType,
        { [workerEdu in EducationLevelType]?: number } | undefined,
    ][];
    const hasOverqualified = overqualifiedEntries.some(
        ([, breakdown]) => breakdown && Object.values(breakdown).some((v) => v && v > 0),
    );

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className='flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors'>
                {open ? <ChevronUp className='h-3 w-3' /> : <ChevronDown className='h-3 w-3' />}
                Efficiency details
            </CollapsibleTrigger>
            <CollapsibleContent className='mt-1 space-y-1 text-xs ml-1'>
                {workerEntries.length > 0 && (
                    <div>
                        <span className='text-muted-foreground'>Workers: </span>
                        <span className='flex flex-wrap gap-x-3 mt-0.5 ml-2'>
                            {workerEntries.map(([edu, eff]) => (
                                <span key={edu}>
                                    <span className='text-muted-foreground'>{eduLabel(edu)}: </span>
                                    <span className={efficiencyColor(eff)}>{pctStr(eff)}</span>
                                </span>
                            ))}
                        </span>
                    </div>
                )}
                {resourceEntries.length > 0 && (
                    <div>
                        <span className='text-muted-foreground'>Resources: </span>
                        <span className='flex flex-wrap gap-x-3 mt-0.5 ml-2'>
                            {resourceEntries.map(([name, eff]) => (
                                <span key={name}>
                                    <span className='text-muted-foreground'>{name}: </span>
                                    <span className={efficiencyColor(eff as number)}>{pctStr(eff as number)}</span>
                                </span>
                            ))}
                        </span>
                    </div>
                )}
                {hasOverqualified && (
                    <div>
                        <span className='text-muted-foreground'>Overqualified: </span>
                        {overqualifiedEntries.map(([jobEdu, breakdown]) => {
                            if (!breakdown) {
                                return null;
                            }
                            const parts = (
                                Object.entries(breakdown) as [EducationLevelType, number | undefined][]
                            ).filter(([, v]) => v && v > 0);
                            if (!parts.length) {
                                return null;
                            }
                            return (
                                <span key={jobEdu} className='ml-2'>
                                    <span className='text-muted-foreground'>{eduLabel(jobEdu)}: </span>
                                    {parts.map(([wEdu, count]) => (
                                        <span key={wEdu} className='mr-1 text-amber-500'>
                                            {eduLabel(wEdu)} ×{count}
                                        </span>
                                    ))}
                                </span>
                            );
                        })}
                    </div>
                )}
            </CollapsibleContent>
        </Collapsible>
    );
}
