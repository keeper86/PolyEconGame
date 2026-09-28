'use client';

import { formatNumberWithUnit } from '@/lib/utils';
import { ProductIcon } from '@/components/client/ProductIcon';
import type { TransportShipStatusUnloading } from '@/simulation/ships/ships';
import React from 'react';
import { useLocale, useTranslations } from 'next-intl';

export function ShipTransportUnloadingRow({ state }: { state: TransportShipStatusUnloading }): React.ReactElement {
    const locale = useLocale();
    const t = useTranslations('Ships');
    return (
        <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
            <ProductIcon productName={state.cargo.resource.name} size={18} />
            <span>
                {t('status.unloading')}{' '}
                <span className='tabular-nums text-foreground'>
                    {formatNumberWithUnit(state.cargo.quantity, 'units', undefined, locale)}
                </span>{' '}
                {state.cargo.resource.name}
            </span>
        </div>
    );
}
