'use client';

import { formatNumberWithUnit } from '@/lib/utils';
import { ProductIcon } from '@/components/client/ProductIcon';
import type { TransportShipStatusTransporting } from '@/simulation/ships/ships';
import { ArrowRight } from 'lucide-react';
import React from 'react';
import { planetName, ShipEta, type PlanetSummary } from './shipFormatting';

export function ShipTransportingRow({
    state,
    planetSummaries,
    tick,
}: {
    state: TransportShipStatusTransporting;
    planetSummaries: PlanetSummary[];
    tick: number;
}): React.ReactElement {
    return (
        <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
            {state.cargo ? (
                <>
                    <ProductIcon productName={state.cargo.resource.name} size={18} />
                    <span>
                        <span className='tabular-nums text-foreground'>
                            {formatNumberWithUnit(state.cargo.quantity, 'units')}
                        </span>{' '}
                        {state.cargo.resource.name}
                    </span>
                </>
            ) : (
                <span>Empty</span>
            )}
            <ArrowRight className='h-3 w-3' />
            <span>{planetName(planetSummaries, state.to)}</span>
            <ShipEta arrivalTick={state.arrivalTick} tick={tick} />
        </div>
    );
}
