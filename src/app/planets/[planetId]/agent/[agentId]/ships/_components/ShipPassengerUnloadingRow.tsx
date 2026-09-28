'use client';

import { formatNumberWithUnit } from '@/lib/utils';
import type { PassengerShipStatusUnloading } from '@/simulation/ships/ships';
import React from 'react';
import { countManifestPassengers } from './PassengerManifestDialog';
import { PassengerManifestButton } from './PassengerManifestButton';
import { planetName, type PlanetSummary } from './shipFormatting';
import { useLocale, useTranslations } from 'next-intl';

export function ShipPassengerUnloadingRow({
    state,
    planetSummaries,
}: {
    state: PassengerShipStatusUnloading;
    planetSummaries: PlanetSummary[];
}): React.ReactElement {
    const locale = useLocale();
    const t = useTranslations('Ships');
    const tu = useTranslations('Units');
    const total = countManifestPassengers(state.manifest);
    const destination = planetName(planetSummaries, state.planetId);

    return (
        <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
            <span>
                {t('status.unloading')}{' '}
                <span className='tabular-nums text-foreground'>
                    {formatNumberWithUnit(total, 'persons', undefined, locale)}
                </span>{' '}
                {tu('passengers')}
            </span>
            <PassengerManifestButton manifest={state.manifest} toPlanetName={destination} phase={state.type} />
        </div>
    );
}
