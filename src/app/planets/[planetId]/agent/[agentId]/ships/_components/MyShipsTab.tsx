'use client';

import React from 'react';
import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { usePendingActions } from '@/hooks/useActionOverlay';
import type { Ship } from '@/simulation/ships/ships';
import { ActionPendingOverlay } from '../../_component/ActionPendingOverlay';
import { CardHeaderBlock } from '../../_component/CardHeaderBlock';
import { FacilityCardShell } from '../../production/_component/FacilityCardShell';
import { ShipActions } from './ShipActions';
import { ShipConditionRow } from './ShipConditionRow';
import { ShipStatusBadge } from './ShipStatusBadge';
import { ShipStatusDetail } from './ShipStatusDetail';
import type { ShipListing, ShipPlanetSummary } from './shipTypes';
import { termFor } from '@/i18n/terms';
import { useLocale, useTranslations } from 'next-intl';

export function MyShipsTab({
    agentId,
    planetId,
    tick,
    ships,
    shipsLoading,
    listings,
    planetSummaries,
}: {
    agentId: string;
    planetId: string;
    tick: number;
    ships: Ship[];
    shipsLoading: boolean;
    listings: ShipListing[];
    planetSummaries: ShipPlanetSummary[];
}): React.ReactElement {
    const pendingActions = usePendingActions(agentId, planetId);
    const t = useTranslations('Ships');
    const tc = useTranslations('Common');
    const tt = useTranslations('Toasts');
    const locale = useLocale();

    const shipsHere = ships
        .filter(
            (s) =>
                ('planetId' in s.state && s.state.planetId === planetId) ||
                ('to' in s.state && s.state.to === planetId) ||
                ('from' in s.state && s.state.from === planetId),
        )
        .map((s) => ({ ...s, disabled: 'to' in s.state || 'from' in s.state }));

    return (
        <div className='space-y-4 mt-3'>
            <h3 className='text-sm font-medium text-muted-foreground'>
                {shipsLoading ? tc('loading') : t('myShips.count', { count: shipsHere.length })}
            </h3>

            {!shipsLoading && shipsHere.length === 0 && (
                <p className='text-sm text-muted-foreground'>{t('myShips.none')}</p>
            )}

            <div className='flex flex-row gap-3 flex-wrap'>
                {shipsHere.map((ship) => {
                    const pending = pendingActions.find((a) => a.shipId === ship.id);
                    return (
                        <FacilityCardShell
                            key={ship.id}
                            className={ship.disabled ? 'opacity-50 pointer-events-none' : ''}
                            contentClassName='relative flex flex-col flex-1 gap-2'
                            icon={<FacilityOrShipIcon facilityOrShipName={ship.type.name} suffix='' size={240} />}
                            headerContent={
                                <CardHeaderBlock
                                    title={ship.name}
                                    titleClassName=''
                                    badge={<ShipStatusBadge ship={ship} />}
                                    details={
                                        <>
                                            <span>
                                                {t('myShips.summary', {
                                                    name: termFor(locale, ship.type.name),
                                                    speed: ship.type.speed,
                                                })}
                                            </span>
                                            {ship.type.type === 'transport' && (
                                                <span className='flex flex-wrap'>
                                                    {t('myShips.cargo', {
                                                        volume: ship.type.cargoSpecification.volume,
                                                        cargoType: termFor(locale, ship.type.cargoSpecification.type),
                                                    })}
                                                </span>
                                            )}
                                            <ShipConditionRow ship={ship} />
                                        </>
                                    }
                                />
                            }
                        >
                            {ship.state.type !== 'idle' &&
                                ship.state.type !== 'listed' &&
                                ship.state.type !== 'derelict' && (
                                    <ShipStatusDetail
                                        ship={ship}
                                        planetSummaries={planetSummaries}
                                        tick={tick}
                                        agentId={agentId}
                                    />
                                )}

                            <ShipActions agentId={agentId} planetId={planetId} ship={ship} listings={listings} />

                            {pending && <ActionPendingOverlay message={tt('awaitingNextDay')} />}
                        </FacilityCardShell>
                    );
                })}
            </div>
        </div>
    );
}
