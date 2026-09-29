'use client';

import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { termFor } from '@/i18n/terms';
import type { ConstructionShipStatusTransporting } from '@/simulation/ships/ships';
import { ArrowRight } from 'lucide-react';
import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { planetName, ShipEta, type PlanetSummary } from './shipFormatting';

export function ShipConstructionTransportRow({
    state,
    planetSummaries,
    tick,
}: {
    state: ConstructionShipStatusTransporting;
    planetSummaries: PlanetSummary[];
    tick: number;
}): React.ReactElement {
    const t = useTranslations('Common');
    const locale = useLocale();
    return (
        <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
            {state.buildingTarget ? (
                <>
                    <FacilityOrShipIcon facilityOrShipName={state.buildingTarget.name} size={18} />
                    <span className='text-foreground'>{termFor(locale, state.buildingTarget.name)}</span>
                </>
            ) : (
                <span>{t('empty')}</span>
            )}
            <ArrowRight className='h-3 w-3' />
            <span>{planetName(planetSummaries, state.to)}</span>
            <ShipEta arrivalTick={state.arrivalTick} tick={tick} />
        </div>
    );
}
