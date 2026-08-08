'use client';

import { defaultHeight } from '@/components/client/FacilityOrShipIcon';
import type { Facility, LastTickResults } from '@/simulation/planet/facility';
import React from 'react';
import { WorkerBars } from './WorkerBars';

export const limitingEfficiency = (results: LastTickResults | undefined): number =>
    results
        ? Math.min(
              ...Object.values(results.resourceEfficiency),
              ...Object.values(results.workerEfficiency).filter((v): v is number => v !== undefined),
          )
        : 0;

export function FacilityHeader({
    facility,
    results,
    planetId,
    agentId,
    badge,
    titleClassName,
}: {
    facility: Facility;
    results?: LastTickResults;
    planetId?: string;
    agentId?: string;
    badge: React.ReactNode;
    titleClassName?: string;
}): React.ReactElement {
    const active = results !== undefined;
    const workerScale = active ? facility.scale : (facility.construction?.constructionTargetMaxScale ?? facility.scale);

    return (
        <span className='flex flex-col space-between gap-2' style={{ minHeight: `${defaultHeight}px` }}>
            <div className='flex items-center gap-1 flex-col mb-1'>
                <h3 className={`font-semibold leading-tight ${titleClassName ?? ''}`}>{facility.name}</h3>
                <span className='flex flex-col items-center gap-1'>{badge}</span>
            </div>
            <span className='flex flex-col text-muted-foreground text-xs gap-2'>
                {active ? 'Worker efficiency' : 'Worker Requirement'}
                <WorkerBars
                    workerRequirement={facility.workerRequirement}
                    scale={workerScale}
                    neutral={!active}
                    workerEfficiency={results?.workerEfficiency ?? {}}
                    globalMin={limitingEfficiency(results)}
                    planetId={planetId}
                    agentId={agentId}
                />
            </span>
        </span>
    );
}
