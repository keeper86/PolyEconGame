'use client';

import type { StorageFacility } from '@/simulation/planet/facility';
import React from 'react';
import { formatNumberWithUnit } from '@/lib/utils';

export function StorageOverview({ storage }: { storage: StorageFacility }): React.ReactElement {
    const entries = Object.entries(storage.currentInStorage ?? {})
        .filter(([, e]) => e && e.quantity > 0)
        .sort(([, a], [, b]) => (b?.quantity ?? 0) - (a?.quantity ?? 0));

    const usedVol = storage.current.volume;
    const scale = storage.department?.scale ?? 0;
    const capVol = storage.capacity.volume * scale;
    const usedMass = storage.current.mass;
    const capMass = storage.capacity.mass * scale;

    return (
        <div className='mt-2'>
            <div className='text-xs text-muted-foreground mb-2'>
                Volume: {formatNumberWithUnit(Math.round(usedVol), 'm3')} /{' '}
                {formatNumberWithUnit(Math.round(capVol), 'm3')}
                {' · '}
                Mass: {formatNumberWithUnit(Math.round(usedMass), 'tonnes')} /{' '}
                {formatNumberWithUnit(Math.round(capMass), 'tonnes')}
            </div>
            {entries.length > 0 ? (
                <div className='grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs'>
                    {entries.map(([name, entry]) => (
                        <div key={name} className='flex justify-between gap-2 px-1'>
                            <span className='truncate text-muted-foreground'>{name}</span>
                            <span className='tabular-nums font-medium'>
                                {formatNumberWithUnit(entry!.quantity, 'units')}
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className='text-xs text-muted-foreground'>Storage empty</div>
            )}
        </div>
    );
}
