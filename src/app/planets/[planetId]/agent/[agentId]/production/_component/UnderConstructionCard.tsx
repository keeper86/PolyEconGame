'use client';

import React from 'react';
import type { ProductionFacility } from '../../../../../../../simulation/planet/facility';
import { formatNumbers } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { FacilityIcon } from '@/components/client/FacilityIcon';
import { HardHat } from 'lucide-react';

export function UnderConstructionCard({ facility }: { facility: ProductionFacility }): React.ReactElement {
    const cs = facility.construction!;
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
        <Card className='overflow-hidden'>
            <CardHeader className='p-3 pb-2'>
                <div className='flex items-start gap-3'>
                    <div className='relative shrink-0'>
                        <FacilityIcon facilityName={facility.name} variant='constructed' />
                        <div className='absolute inset-0 bg-background/50 rounded' />
                    </div>
                    <div className='flex-1 min-w-0'>
                        <div className='flex items-center gap-2 flex-wrap'>
                            <h3 className='font-semibold text-sm leading-tight'>{facility.name}</h3>
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
                    </div>
                </div>
            </CardHeader>
            <CardContent className='px-3 pb-3 space-y-2'>
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
                            {formatNumbers(cs.lastTickInvestedConstructionServices)} cs
                        </div>
                    </div>
                    <div className='rounded bg-muted px-2 py-1'>
                        <div className='text-muted-foreground'>Max / tick</div>
                        <div className='tabular-nums font-medium'>
                            {formatNumbers(cs.maximumConstructionServiceConsumption)} cs
                        </div>
                    </div>
                    <div className='rounded bg-muted px-2 py-1'>
                        <div className='text-muted-foreground'>Est. ticks</div>
                        <div className='tabular-nums font-medium text-amber-600'>{ticksEst}</div>
                    </div>
                </div>
                <p className='text-xs text-muted-foreground'>
                    Remaining: <span className='tabular-nums'>{formatNumbers(remaining)}</span> /{' '}
                    {formatNumbers(cs.totalConstructionServiceRequired)} construction services
                </p>
            </CardContent>
        </Card>
    );
}
