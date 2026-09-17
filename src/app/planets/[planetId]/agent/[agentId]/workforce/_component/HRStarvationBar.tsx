'use client';

import { BANDS, classifyBand } from '@/components/client/starvationBands';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { computeProductivityMultiplier } from '@/simulation/workforce/hrBuffer';
import { Users } from 'lucide-react';
import React from 'react';

export function HRStarvationBar({ starvation }: { starvation: number }): React.ReactElement {
    const smallScreen = useIsSmallScreen();
    const pct = Math.round(computeProductivityMultiplier(starvation) * 100);
    const color = BANDS[classifyBand(starvation)].color;

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div
                    className='flex flex-col gap-1 items-start py-2 px-2 text-xs text-muted-foreground'
                    data-tour='hr-starvation'
                >
                    <div className='flex w-full flex-row justify-between'>
                        <span className='flex items-center gap-1'>
                            <Users className='h-4 w-4' />
                            HR {smallScreen ? '' : 'productivity'}
                        </span>
                        <span style={{ color }}>{pct}%</span>
                    </div>

                    <div className='h-2 w-full rounded-full bg-muted overflow-hidden'>
                        <div
                            className='h-full rounded-full transition-all duration-300'
                            style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                    </div>
                </div>
            </TooltipTrigger>
            <TooltipContent side='bottom' className='max-w-[200px]'>
                <div className='text-xs space-y-1'>
                    <div style={{ color }}>HR productivity: {pct}%</div>
                    <div style={{ color }}>Starvation: {Math.round(starvation * 100)}%</div>
                    <div className='text-muted-foreground'>
                        {starvation >= 0.5
                            ? 'Your HR Department cannot keep up with worker demand. Expand it to restore productivity.'
                            : 'Your HR Department is keeping workers supplied.'}
                    </div>
                </div>
            </TooltipContent>
        </Tooltip>
    );
}
