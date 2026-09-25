'use client';

import type { Ship } from '@/simulation/ships/ships';
import React from 'react';
import { ConditionBar } from '../../production/_component/ConditionBar';

export function ShipConditionRow({
    ship,
}: {
    ship: Pick<Ship, 'maintainanceStatus' | 'maxMaintenance'>;
}): React.ReactElement {
    return (
        <div className='space-y-1'>
            <ConditionBar status={ship.maintainanceStatus} max={ship.maxMaintenance} />
        </div>
    );
}
