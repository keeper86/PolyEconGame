'use client';

import type { StorageFacility } from '@/simulation/planet/storage';
import React from 'react';
import { formatNumbers } from '@/lib/utils';

export function StorageOverview({ storage }: { storage: StorageFacility }): React.ReactElement {
    const entries = Object.entries(storage.currentInStorage ?? {})
        .filter(([, e]) => e && e.quantity > 0)
        .sort(([, a], [, b]) => (b?.quantity ?? 0) - (a?.quantity ?? 0));

    const usedVol = storage.current.volume;
    const capVol = storage.capacity.volume * storage.scale;
    const usedMass = storage.current.mass;
    const capMass = storage.capacity.mass * storage.scale;

    return (
        <div className='mt-4'>
            <h3 className='text-sm font-medium mb-2'>Storage</h3>
            <div className='text-xs text-muted-foreground mb-2'>
                Volume: {formatNumbers(Math.round(usedVol))} / {formatNumbers(Math.round(capVol))} m³
                {' · '}
                Mass: {formatNumbers(Math.round(usedMass))} / {formatNumbers(Math.round(capMass))} t
            </div>
            {entries.length > 0 ? (
                <div className='grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs'>
                    {entries.map(([name, entry]) => (
                        <div key={name} className='flex justify-between gap-2 px-1'>
                            <span className='truncate text-muted-foreground'>{name}</span>
                            <span className='tabular-nums font-medium'>{formatNumbers(entry!.quantity)}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className='text-xs text-muted-foreground'>Storage empty</div>
            )}
        </div>
    );
}
