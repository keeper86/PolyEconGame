'use client';

import { formatNumberWithUnit } from '@/lib/utils';
import type { PassengerShipStatusTransporting } from '@/simulation/ships/ships';
import { ArrowRight } from 'lucide-react';
import React from 'react';
import { countManifestPassengers } from './PassengerManifestDialog';
import { PassengerManifestButton } from './PassengerManifestButton';
import { planetName, ShipEta, type PlanetSummary } from './shipFormatting';

export function ShipPassengerTransportingRow({
    state,
    planetSummaries,
    tick,
}: {
    state: PassengerShipStatusTransporting;
    planetSummaries: PlanetSummary[];
    tick: number;
}): React.ReactElement {
    const total = countManifestPassengers(state.manifest);
    const destination = planetName(planetSummaries, state.to);

    return (
        <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
            <span>
                <span className='tabular-nums text-foreground'>{formatNumberWithUnit(total, 'persons')}</span>{' '}
                passengers
            </span>
            <ArrowRight className='h-3 w-3' />
            <span>{destination}</span>
            <ShipEta arrivalTick={state.arrivalTick} tick={tick} />
            <PassengerManifestButton manifest={state.manifest} toPlanetName={destination} phase={state.type} />
        </div>
    );
}
