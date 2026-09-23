'use client';

import React from 'react';
import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { usePendingActions } from '@/hooks/useActionOverlay';
import type { Ship } from '@/simulation/ships/ships';
import { ActionPendingOverlay } from '../../production/_component/ActionPendingOverlay';
import { CardHeaderBlock } from '../../production/_component/CardHeaderBlock';
import { FacilityCardShell } from '../../production/_component/FacilityCardShell';
import { ShipActions } from './ShipActions';
import { ShipConditionRow } from './ShipConditionRow';
import { ShipStatusBadge } from './ShipStatusBadge';
import { ShipStatusDetail } from './ShipStatusDetail';
import type { ShipListing, ShipPlanetSummary } from './shipTypes';

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
                {shipsLoading
                    ? 'Loading…'
                    : `${shipsHere.length} ship${shipsHere.length === 1 ? '' : 's'} on this planet`}
            </h3>

            {!shipsLoading && shipsHere.length === 0 && (
                <p className='text-sm text-muted-foreground'>No ships currently stationed on this planet.</p>
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
                                                {ship.type.name} · speed {ship.type.speed}
                                            </span>
                                            {ship.type.type === 'transport' && (
                                                <span className='flex flex-wrap'>
                                                    {ship.type.cargoSpecification.volume} m³ ·{' '}
                                                    {ship.type.cargoSpecification.type}
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

                            {pending && <ActionPendingOverlay message='Awaiting next day…' />}
                        </FacilityCardShell>
                    );
                })}
            </div>
        </div>
    );
}
