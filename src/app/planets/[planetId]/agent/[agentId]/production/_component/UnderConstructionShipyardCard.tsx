'use client';

import React from 'react';
import type { ShipConstructionFacility } from '@/simulation/planet/facility';
import { formatNumberWithUnit } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { HardHat } from 'lucide-react';
import { FacilityCardShell } from './FacilityCardShell';
import { Button } from '@/components/ui/button';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Anchor } from 'lucide-react';

export function UnderConstructionShipyardCard({
    facility,
}: {
    facility: ShipConstructionFacility;
}): React.ReactElement {
    const cs = facility.construction!;
    const { planetId, agentId } = useParams() as { planetId: string; agentId: string };
    const pct =
        cs.totalConstructionServiceRequired > 0
            ? Math.min(100, (cs.progress / cs.totalConstructionServiceRequired) * 100)
            : 0;
    const remaining = Math.max(0, cs.totalConstructionServiceRequired - cs.progress);
    const ticksEst =
        cs.maximumConstructionServiceConsumption > 0
            ? Math.ceil(remaining / cs.maximumConstructionServiceConsumption)
            : '?';

    return (
        <FacilityCardShell
            className='sm:w-[500px]'
            contentClassName='space-y-2'
            icon={
                <div className='relative shrink-0'>
                    <div className='flex items-center justify-center w-10 h-10 rounded bg-muted'>
                        <Anchor className='h-6 w-6 text-muted-foreground' />
                    </div>
                    <div className='absolute inset-0 bg-background/50 rounded' />
                </div>
            }
            headerContent={
                <>
                    <div className='flex items-center gap-2 flex-wrap'>
                        <h3 className='font-semibold leading-tight mb-2'>{facility.name}</h3>
                        <Badge
                            variant='secondary'
                            className='text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 text-[10px] px-1.5 py-0 gap-1'
                        >
                            <HardHat className='h-2.5 w-2.5' />
                            Under Construction
                        </Badge>
                    </div>
                    <p className='text-xs text-muted-foreground mt-0.5'>
                        Scale {facility.scale} →{' '}
                        <span className='font-medium text-foreground'>{cs.constructionTargetMaxScale}</span>
                    </p>
                </>
            }
        >
            <div>
                <div className='flex justify-between text-xs text-muted-foreground mb-1'>
                    <span>Construction progress</span>
                    <span className='tabular-nums font-medium text-foreground'>{pct.toFixed(1)}%</span>
                </div>
                <Progress value={pct} className='h-2.5 bg-amber-100 dark:bg-amber-950/40 [&>div]:bg-amber-500' />
            </div>
            <div className='grid grid-cols-3 gap-2 text-xs'>
                <div className='rounded bg-muted px-2 py-1'>
                    <div className='text-muted-foreground'>Last tick</div>
                    <div className='tabular-nums font-medium'>
                        {formatNumberWithUnit(cs.lastTickInvestedConstructionServices, 'units')} cs
                    </div>
                </div>
                <div className='rounded bg-muted px-2 py-1'>
                    <div className='text-muted-foreground'>Max / tick</div>
                    <div className='tabular-nums font-medium'>
                        {formatNumberWithUnit(cs.maximumConstructionServiceConsumption, 'units')} cs
                    </div>
                </div>
                <div className='rounded bg-muted px-2 py-1'>
                    <div className='text-muted-foreground'>Est. ticks</div>
                    <div className='tabular-nums font-medium text-amber-600'>{ticksEst}</div>
                </div>
            </div>
            <p className='text-xs text-muted-foreground'>
                Remaining: <span className='tabular-nums'>{formatNumberWithUnit(remaining, 'units')}</span> /{'  '}
                {formatNumberWithUnit(cs.totalConstructionServiceRequired, 'units')} construction
            </p>
            <Button size='sm' variant='outline' asChild>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Link href={`/planets/${planetId}/agent/${agentId}/market#construction` as any}>Buy construction</Link>
            </Button>
        </FacilityCardShell>
    );
}
