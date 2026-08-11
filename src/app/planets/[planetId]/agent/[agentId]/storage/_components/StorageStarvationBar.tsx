'use client';

import { inflowPreservation, storagePreservationFactor } from '@/simulation/planet/facility';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import React from 'react';

function starvColor(ss: number): string {
    if (ss < 0.2) {
        return '#22c55e';
    }
    if (ss < 0.5) {
        return '#f59e0b';
    }
    return '#ef4444';
}

function starvLabel(ss: number): string {
    if (ss < 0.1) {
        return 'Well supplied';
    }
    if (ss < 0.3) {
        return 'Mild strain';
    }
    if (ss < 0.6) {
        return 'Underfed';
    }
    return 'Starved';
}

export function StorageStarvationBar({ ss }: { ss: number }): React.ReactElement {
    const pct = ss * 100;
    const color = starvColor(ss);
    const label = starvLabel(ss);
    const inflowPct = (inflowPreservation(ss) * 100).toFixed(0);
    const storagePct = (storagePreservationFactor(ss) * 100).toFixed(0);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className='flex flex-col gap-0.5 w-full'>
                    <div className='flex items-center justify-between text-[10px] text-muted-foreground'>
                        <span>Logistics</span>
                        <span>{label}</span>
                    </div>
                    <div className='h-2 w-full rounded-full bg-muted overflow-hidden'>
                        <div
                            className='h-full rounded-full transition-all duration-300'
                            style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                    </div>
                </div>
            </TooltipTrigger>
            <TooltipContent side='bottom' className='max-w-[200px]'>
                <div className='text-xs space-y-1'>
                    <div>Logistics Health: {(100 - pct).toFixed(0)}%</div>
                    <div>Inflow Efficiency: {inflowPct}%</div>
                    <div>Storage Preservation: {storagePct}%</div>
                    <div className='text-muted-foreground'>
                        {ss >= 0.5
                            ? 'Expand your Storage Department to reduce losses.'
                            : 'Storage Department is keeping logistics stable.'}
                    </div>
                </div>
            </TooltipContent>
        </Tooltip>
    );
}
