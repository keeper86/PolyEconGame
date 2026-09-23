'use client';

import type { PassengerShipStatusUnloading } from '@/simulation/ships/ships';
import React from 'react';
import { countManifestPassengers } from './PassengerManifestDialog';
import { PassengerManifestButton } from './PassengerManifestButton';
import { planetName, type PlanetSummary } from './shipFormatting';

export function ShipPassengerUnloadingRow({
    state,
    planetSummaries,
}: {
    state: PassengerShipStatusUnloading;
    planetSummaries: PlanetSummary[];
}): React.ReactElement {
    const total = countManifestPassengers(state.manifest);
    const destination = planetName(planetSummaries, state.planetId);

    return (
        <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
            <span>
                Unloading <span className='tabular-nums text-foreground'>{total.toLocaleString()}</span> passengers
            </span>
            <PassengerManifestButton manifest={state.manifest} toPlanetName={destination} phase={state.type} />
        </div>
    );
}
