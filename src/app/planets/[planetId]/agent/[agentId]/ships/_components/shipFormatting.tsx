'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

export type PlanetSummary = { planetId: string; name: string };

export function planetName(planetSummaries: PlanetSummary[], id: string): string {
    return planetSummaries.find((p) => p.planetId === id)?.name ?? id;
}

export function ShipEta({ arrivalTick, tick }: { arrivalTick: number; tick: number }): React.ReactElement {
    const t = useTranslations('Ships');
    const eta = arrivalTick - tick;
    return (
        <span className='text-muted-foreground/70'>
            {t('status.eta')}{' '}
            <span className='tabular-nums text-foreground'>
                {eta > 0 ? t('status.etaDays', { days: eta }) : t('status.arriving')}
            </span>
        </span>
    );
}
