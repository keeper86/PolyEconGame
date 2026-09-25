'use client';

import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { Progress } from '@/components/ui/progress';
import type { ConstructionShipStatusLoading } from '@/simulation/ships/ships';
import { ArrowRight } from 'lucide-react';
import React from 'react';
import { planetName, type PlanetSummary } from './shipFormatting';

export function ShipPreFabricationRow({
    state,
    planetSummaries,
}: {
    state: ConstructionShipStatusLoading;
    planetSummaries: PlanetSummary[];
}): React.ReactElement {
    const construction = state.buildingTarget?.construction ?? null;
    const pct =
        construction && construction.totalConstructionServiceRequired > 0
            ? Math.min(100, (construction.progress / construction.totalConstructionServiceRequired) * 100)
            : 0;

    return (
        <div className='space-y-1.5'>
            <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
                {state.buildingTarget ? (
                    <>
                        <FacilityOrShipIcon facilityOrShipName={state.buildingTarget.name} size={18} />
                        <span className='text-foreground'>{state.buildingTarget.name}</span>
                    </>
                ) : (
                    <span>Repositioning</span>
                )}
                <ArrowRight className='h-3 w-3' />
                <span>{planetName(planetSummaries, state.to)}</span>
            </div>
            {construction && (
                <div>
                    <div className='flex justify-between text-xs text-muted-foreground mb-1'>
                        <span>Prefabrication</span>
                        <span className='tabular-nums font-medium text-foreground'>{pct.toFixed(0)}%</span>
                    </div>
                    <Progress value={pct} className='h-1.5 bg-amber-100 dark:bg-amber-950/40 [&>div]:bg-amber-500' />
                </div>
            )}
        </div>
    );
}
