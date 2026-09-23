'use client';

import { Progress } from '@/components/ui/progress';
import type { Ship } from '@/simulation/ships/ships';
import { Wrench } from 'lucide-react';
import React from 'react';
import { conditionTone } from '../../production/_component/FacilityConditionRow';

export function ShipConditionRow({
    ship,
}: {
    ship: Pick<Ship, 'maintainanceStatus' | 'maxMaintenance'>;
}): React.ReactElement {
    const tone = conditionTone(ship.maintainanceStatus);
    const fillPct =
        ship.maxMaintenance > 0 ? Math.min(100, Math.max(0, (ship.maintainanceStatus / ship.maxMaintenance) * 100)) : 0;

    return (
        <div className='space-y-1'>
            <div className='flex flex-row w-full justify-between text-xs text-muted-foreground'>
                <span className='flex items-center gap-1.5'>
                    <Wrench className='h-3.5 w-3.5' />
                    Condition
                </span>
                <span className={`font-medium ${tone.text}`}>
                    {Math.round(ship.maintainanceStatus * 100)}% / {Math.round(ship.maxMaintenance * 100)}% max
                </span>
            </div>
            <Progress value={fillPct} className={`h-2.5 ${tone.bar}`} />
        </div>
    );
}
