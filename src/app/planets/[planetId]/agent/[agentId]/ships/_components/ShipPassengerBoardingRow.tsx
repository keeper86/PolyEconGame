'use client';

import { formatNumberWithUnit } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import type { PassengerShipStatusLoading } from '@/simulation/ships/ships';
import { ArrowRight } from 'lucide-react';
import React from 'react';
import { PassengerManifestButton } from './PassengerManifestButton';
import { planetName, type PlanetSummary } from './shipFormatting';

export function ShipPassengerBoardingRow({
    state,
    planetSummaries,
}: {
    state: PassengerShipStatusLoading;
    planetSummaries: PlanetSummary[];
}): React.ReactElement {
    const pct = state.passengerGoal > 0 ? (state.currentPassengers / state.passengerGoal) * 100 : 0;
    const destination = planetName(planetSummaries, state.to);

    return (
        <div className='space-y-1.5'>
            <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
                <span>
                    Boarding:{' '}
                    <span className='tabular-nums text-foreground'>
                        {formatNumberWithUnit(state.currentPassengers, 'persons')}
                    </span>
                    {' / '}
                    <span className='tabular-nums'>{formatNumberWithUnit(state.passengerGoal, 'persons')}</span>{' '}
                    passengers
                </span>
                <ArrowRight className='h-3 w-3' />
                <span>{destination}</span>
                <PassengerManifestButton manifest={state.manifest} toPlanetName={destination} phase={state.type} />
            </div>
            <Progress value={pct} className='h-1.5' />
        </div>
    );
}
