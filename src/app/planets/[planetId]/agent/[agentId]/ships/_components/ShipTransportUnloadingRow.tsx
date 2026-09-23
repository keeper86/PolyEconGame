'use client';

import { ProductIcon } from '@/components/client/ProductIcon';
import type { TransportShipStatusUnloading } from '@/simulation/ships/ships';
import React from 'react';

export function ShipTransportUnloadingRow({ state }: { state: TransportShipStatusUnloading }): React.ReactElement {
    return (
        <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
            <ProductIcon productName={state.cargo.resource.name} size={18} />
            <span>
                Unloading <span className='tabular-nums text-foreground'>{state.cargo.quantity.toLocaleString()}</span>{' '}
                {state.cargo.resource.name}
            </span>
        </div>
    );
}
