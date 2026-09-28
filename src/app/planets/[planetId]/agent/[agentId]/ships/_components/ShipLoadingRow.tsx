'use client';

import { ProductIcon } from '@/components/client/ProductIcon';
import { formatNumberWithUnit, resourceFormToUnit } from '@/lib/utils';
import type { TransportShipStatusLoading } from '@/simulation/ships/ships';
import { ArrowRight } from 'lucide-react';
import React from 'react';
import { ShipCargoProgress } from './ShipCargoProgress';
import { planetName, type PlanetSummary } from './shipFormatting';
import { useLocale, useTranslations } from 'next-intl';

export function ShipLoadingRow({
    state,
    planetSummaries,
}: {
    state: TransportShipStatusLoading;
    planetSummaries: PlanetSummary[];
}): React.ReactElement {
    const locale = useLocale();
    const t = useTranslations('Ships');
    const cargo =
        state.cargoGoal && state.currentCargo && state.cargoGoal.quantity !== 0
            ? {
                  goal: state.cargoGoal,
                  current: state.currentCargo,
                  unit: resourceFormToUnit(state.cargoGoal.resource.form),
              }
            : null;

    return (
        <div className='space-y-1.5'>
            <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
                {cargo ? (
                    <>
                        <ProductIcon productName={cargo.goal.resource.name} />
                        <span>
                            {t('status.loading')}{' '}
                            <span className='tabular-nums text-foreground'>
                                {formatNumberWithUnit(cargo.current.quantity, cargo.unit, undefined, locale)}
                            </span>
                            {' / '}
                            <span className='tabular-nums'>
                                {formatNumberWithUnit(cargo.goal.quantity, cargo.unit, undefined, locale)}
                            </span>{' '}
                            {cargo.goal.resource.name}
                        </span>
                    </>
                ) : (
                    <span>{t('status.repositioningEmpty')}</span>
                )}
                <ArrowRight className='h-3 w-3' />
                <span>{planetName(planetSummaries, state.to)}</span>
            </div>
            {cargo && <ShipCargoProgress goal={cargo.goal} current={cargo.current} />}
        </div>
    );
}
