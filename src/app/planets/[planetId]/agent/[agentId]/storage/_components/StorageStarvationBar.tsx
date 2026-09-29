'use client';

import { inflowPreservation, storagePreservationFactor } from '@/simulation/planet/facility';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BANDS, classifyBand } from '@/components/client/starvationBands';
import React from 'react';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { FaTruck } from 'react-icons/fa';
import { Warehouse } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function StorageStarvationBar({
    ss,
    scope = 'department',
}: {
    ss: number;
    scope?: 'department' | 'shell';
}): React.ReactElement {
    const smallScreen = useIsSmallScreen();
    const tr = useTranslations('Storage');
    const pct = ss * 100;
    const healthColor = BANDS[classifyBand(ss)].color;
    const storageColor = BANDS[classifyBand(1 - storagePreservationFactor(ss))].color;

    const storageHalf = (
        <span className='flex flex-1 flex-col gap-1 items-start'>
            <span className='flex w-full flex-row justify-between'>
                <span className='flex items-center gap-1'>
                    <Warehouse className='h-4 w-4' />
                    {smallScreen ? tr('storageShort') : tr('storageHealthLabel')}
                </span>
                <span style={{ color: storageColor }}>{storagePreservationFactor(ss) * 100}%</span>
            </span>

            <div className='h-2 w-full rounded-full bg-muted overflow-hidden'>
                <div
                    className='h-full rounded-full transition-all duration-300'
                    style={{ width: `${storagePreservationFactor(ss) * 100}%`, backgroundColor: storageColor }}
                />
            </div>
        </span>
    );

    const inflowHalf = (
        <span className='flex flex-1 flex-col gap-1 items-start'>
            <span className='flex w-full flex-row justify-between'>
                <span className='flex items-center gap-1'>
                    <FaTruck className='h-4 w-4' />
                    {smallScreen ? tr('transportShort') : tr('transportEfficiencyLabel')}
                </span>
                <span style={{ color: BANDS[classifyBand(1 - inflowPreservation(ss))].color }}>
                    {inflowPreservation(ss) * 100}%
                </span>
            </span>

            <div className='h-2 w-full rounded-full bg-muted overflow-hidden'>
                <div
                    className='h-full rounded-full transition-all duration-300'
                    style={{
                        width: `${inflowPreservation(ss) * 100}%`,
                        backgroundColor: BANDS[classifyBand(1 - inflowPreservation(ss))].color,
                    }}
                />
            </div>
        </span>
    );

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div
                    className='flex flex-row items-center gap-4 py-2 px-2 text-xs text-muted-foreground'
                    data-tour='storage-starvation'
                >
                    {scope === 'shell' && storageHalf}
                    {scope === 'department' && inflowHalf}
                </div>
            </TooltipTrigger>
            <TooltipContent side='bottom' className='max-w-[200px]'>
                <div className='text-xs space-y-1'>
                    {scope === 'shell' && (
                        <>
                            <div style={{ color: healthColor }}>
                                {tr('storageHealthTooltip')} {(100 - pct).toFixed(0)}%
                            </div>
                            <div style={{ color: BANDS[classifyBand(1 - storagePreservationFactor(ss))].color }}>
                                {tr('preservationTooltip')} {storagePreservationFactor(ss) * 100}%
                            </div>
                            <div className='text-muted-foreground'>
                                {ss >= 0.5 ? tr('overUtilised') : tr('stableStorage')}
                            </div>
                        </>
                    )}
                    {scope === 'department' && (
                        <>
                            <div style={{ color: healthColor }}>
                                {tr('transportHealthTooltip')} {(100 - pct).toFixed(0)}%
                            </div>
                            <div style={{ color: BANDS[classifyBand(1 - inflowPreservation(ss))].color }}>
                                {tr('inflowTooltip')} {inflowPreservation(ss) * 100}%
                            </div>
                            <div className='text-muted-foreground'>
                                {ss >= 0.5 ? tr('expandLogistics') : tr('flowStable')}
                            </div>
                        </>
                    )}
                </div>
            </TooltipContent>
        </Tooltip>
    );
}
