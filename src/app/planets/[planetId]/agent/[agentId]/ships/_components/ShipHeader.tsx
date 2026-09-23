'use client';

import { defaultHeight } from '@/components/client/FacilityOrShipIcon';
import type { Ship } from '@/simulation/ships/ships';
import React from 'react';

export function ShipHeader({
    ship,
    badge,
    details,
}: {
    ship: Ship;
    badge: React.ReactNode;
    details?: React.ReactNode;
}): React.ReactElement {
    return (
        <span className='flex flex-col space-between gap-2' style={{ minHeight: `${defaultHeight}px` }}>
            <div className='flex items-center gap-1 flex-col mb-1'>
                <h3 className='font-semibold leading-tight'>{ship.name}</h3>
                <span className='flex flex-col items-center gap-1'>{badge}</span>
            </div>
            <span className='flex flex-col text-muted-foreground text-xs gap-2'>{details}</span>
        </span>
    );
}
