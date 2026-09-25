'use client';

import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { Progress } from '@/components/ui/progress';
import type { ConstructionShipStatusUnloading } from '@/simulation/ships/ships';
import React from 'react';

export function ShipReconstructionRow({ state }: { state: ConstructionShipStatusUnloading }): React.ReactElement {
    const pct = (1 - state.progress) * 100;

    return (
        <div className='space-y-1.5'>
            <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
                <FacilityOrShipIcon facilityOrShipName={state.buildingTarget.name} size={18} />
                <span className='text-foreground'>{state.buildingTarget.name}</span>
            </div>
            <div>
                <div className='flex justify-between text-xs text-muted-foreground mb-1'>
                    <span>Reconstruction</span>
                    <span className='tabular-nums font-medium text-foreground'>{pct.toFixed(1)}%</span>
                </div>
                <Progress value={pct} className='h-1.5 bg-amber-100 dark:bg-amber-950/40 [&>div]:bg-amber-500' />
            </div>
        </div>
    );
}
