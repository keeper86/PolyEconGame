'use client';

import { Progress } from '@/components/ui/progress';
import { FACILITY_MAINTENANCE_REPAIR_PER_TICK, FACILITY_RESTORATION_PER_TICK } from '@/simulation/constants';
import type { Facility } from '@/simulation/planet/facility';
import { Wrench } from 'lucide-react';
import React from 'react';

function conditionTone(status: number): { text: string; bar: string } {
    if (status >= 0.75) {
        return { text: 'text-green-600', bar: '[&>div]:bg-green-500' };
    }
    if (status >= 0.4) {
        return { text: 'text-yellow-600', bar: '[&>div]:bg-yellow-500' };
    }
    return { text: 'text-red-600', bar: '[&>div]:bg-red-500' };
}

export function FacilityConditionRow({ facility }: { facility: Facility }): React.ReactElement {
    const maxMaintenance = facility.maxMaintenance;
    const status = facility.maintenanceStatus;
    const tone = conditionTone(status);
    const fillPct = maxMaintenance > 0 ? Math.min(100, Math.max(0, (status / maxMaintenance) * 100)) : 0;

    return (
        <div className='rounded-md border p-2 space-y-1.5'>
            <div className='flex items-center justify-between gap-2'>
                <span className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                    <Wrench className='h-3.5 w-3.5' />
                    Condition
                </span>
                <span className={`font-medium text-xs ${tone.text}`}>
                    {Math.round(status * 100)}% / {Math.round(maxMaintenance * 100)}% max
                </span>
            </div>
            <Progress value={fillPct} className={`h-2.5 ${tone.bar}`} />
            <div className='flex items-center justify-between gap-2 text-[10px] text-muted-foreground'>
                <span>Maintenance +{FACILITY_MAINTENANCE_REPAIR_PER_TICK}/tick</span>
                {maxMaintenance < 1 && <span>Restoring +{FACILITY_RESTORATION_PER_TICK}/tick</span>}
            </div>
        </div>
    );
}
