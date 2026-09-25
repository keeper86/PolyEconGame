'use client';

import React from 'react';

export type PlanetSummary = { planetId: string; name: string };

export function planetName(planetSummaries: PlanetSummary[], id: string): string {
    return planetSummaries.find((p) => p.planetId === id)?.name ?? id;
}

export function ShipEta({ arrivalTick, tick }: { arrivalTick: number; tick: number }): React.ReactElement {
    const eta = arrivalTick - tick;
    return (
        <span className='text-muted-foreground/70'>
            ETA{' '}
            <span className='tabular-nums text-foreground'>
                {eta > 0 ? `${eta} day${eta === 1 ? '' : 's'}` : 'arriving'}
            </span>
        </span>
    );
}
