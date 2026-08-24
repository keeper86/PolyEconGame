'use client';

import { inflowPreservation, storagePreservationFactor } from '@/simulation/planet/facility';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import React from 'react';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { FaTruck } from 'react-icons/fa';
import { Warehouse } from 'lucide-react';

const BANDS = [
    { color: '#7f1d1d', limit: 0.9 },
    { color: '#b91c1c', limit: 0.75 },
    { color: '#ea580c', limit: 0.5 },
    { color: '#f59e0b', limit: 0.25 },
    { color: '#d9e70eff', limit: 0.1 },
    { color: '#16a34a', limit: 0 },
] as const;

function classifyBand(starvationLevel: number): number {
    const index = BANDS.findIndex((band) => starvationLevel > band.limit);
    return index === -1 ? BANDS.length - 1 : index;
}

export function StorageStarvationBar({ ss }: { ss: number }): React.ReactElement {
    const smallScreen = useIsSmallScreen();
    const pct = ss * 100;
    const healthColor = BANDS[classifyBand(ss)].color;
    const inflowPct = (inflowPreservation(ss) * 100).toFixed(0);
    const storagePct = (storagePreservationFactor(ss) * 100).toFixed(0);
    const inflowColor = BANDS[classifyBand(1 - inflowPreservation(ss))].color;
    const storageColor = BANDS[classifyBand(1 - storagePreservationFactor(ss))].color;

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div
                    className='flex flex-row items-center gap-4 py-2 px-2 text-xs text-muted-foreground'
                    data-tour='storage-starvation'
                >
                    <span className='flex flex-1 flex-col gap-1 items-start'>
                        <span className='flex w-full flex-row justify-between'>
                            <span className='flex items-center gap-1'>
                                <Warehouse className='h-4 w-4' />
                                Storage {smallScreen ? '' : 'health'}
                            </span>
                            <span style={{ color: storageColor }}>{storagePct}%</span>
                        </span>

                        <div className='h-2 w-full rounded-full bg-muted overflow-hidden'>
                            <div
                                className='h-full rounded-full transition-all duration-300'
                                style={{ width: `${storagePct}%`, backgroundColor: storageColor }}
                            />
                        </div>
                    </span>
                    <span className='flex flex-1 flex-col gap-1 items-start'>
                        <span className='flex w-full flex-row justify-between'>
                            <span className='flex items-center gap-1'>
                                <FaTruck className='h-4 w-4' />
                                Transport {smallScreen ? '' : 'efficiency'}
                            </span>
                            <span style={{ color: inflowColor }}>{inflowPct}%</span>
                        </span>

                        <div className='h-2 w-full rounded-full bg-muted overflow-hidden'>
                            <div
                                className='h-full rounded-full transition-all duration-300'
                                style={{ width: `${inflowPct}%`, backgroundColor: inflowColor }}
                            />
                        </div>
                    </span>
                </div>
            </TooltipTrigger>
            <TooltipContent side='bottom' className='max-w-[200px]'>
                <div className='text-xs space-y-1'>
                    <div style={{ color: healthColor }}>Logistics Health: {(100 - pct).toFixed(0)}%</div>
                    <div style={{ color: BANDS[classifyBand(1 - inflowPreservation(ss))].color }}>
                        Inflow Efficiency: {inflowPct}%
                    </div>
                    <div style={{ color: BANDS[classifyBand(1 - storagePreservationFactor(ss))].color }}>
                        Storage Preservation: {storagePct}%
                    </div>
                    <div className='text-muted-foreground'>
                        {ss >= 0.5
                            ? 'Expand your Storage Department to reduce losses.'
                            : 'Storage Department is keeping logistics stable.'}
                    </div>
                </div>
            </TooltipContent>
        </Tooltip>
    );
}
