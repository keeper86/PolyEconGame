'use client';

import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { ProductQuantity } from '@/components/client/ProductQuantity';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import type { Facility } from '@/simulation/planet/facility';
import { constructionServiceResourceType } from '@/simulation/planet/services';
import { HardHat } from 'lucide-react';
import { useParams } from 'next/navigation';
import React from 'react';
import { RiArrowRightBoxFill } from 'react-icons/ri';
import { FacilityCardShell } from './FacilityCardShell';

export function UnderConstructionCard({ facility }: { facility: Facility }): React.ReactElement {
    const cs = facility.construction!;
    const pct =
        cs.totalConstructionServiceRequired > 0
            ? Math.min(100, (cs.progress / cs.totalConstructionServiceRequired) * 100)
            : 0;

    return (
        <FacilityCardShell
            contentClassName='flex flex-col flex-1 gap-2'
            icon={
                facility.type === 'ship_construction' ? (
                    <FacilityOrShipIcon
                        facilityOrShipName={'Shipyard'}
                        buildProgress={pct / 100}
                        suffix={String(facility.scale)}
                    />
                ) : (
                    <FacilityOrShipIcon facilityOrShipName={facility.name} buildProgress={pct / 100} />
                )
            }
            headerContent={
                <>
                    <div className='flex flex-col items-center gap-2'>
                        <h3 className='font-semibold leading-tight mb-2'>{facility.name}</h3>
                        <Badge
                            variant='secondary'
                            className='text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 text-[10px] px-1.5 py-0 gap-1'
                        >
                            <HardHat className='h-2.5 w-2.5' />
                            Under Construction
                        </Badge>
                    </div>
                </>
            }
        >
            <UnderConstructionCompactRow facility={facility} onCancel={() => {}} />
        </FacilityCardShell>
    );
}

export function UnderConstructionCompactRow({
    facility,
    onCancel,
}: {
    facility: Facility;
    onCancel: () => void;
}): React.ReactElement {
    const { planetId, agentId } = useParams() as { planetId: string; agentId: string };
    const cs = facility.construction;

    if (!cs) {
        return <div>Error: Facility is not under construction</div>;
    }

    const pct =
        cs.totalConstructionServiceRequired > 0
            ? Math.min(100, (cs.progress / cs.totalConstructionServiceRequired) * 100)
            : 0;

    return (
        <>
            <div className='grid w-full items-center gap-x-2 py-2' style={{ gridTemplateColumns: '1fr auto 3fr' }}>
                <div className='flex flex-wrap gap-1.5 justify-center'>
                    <ProductQuantity
                        quantity={cs.lastTickInvestedConstructionServices}
                        resource={constructionServiceResourceType}
                        efficiency={cs.lastTickInvestedConstructionServices / cs.maximumConstructionServiceConsumption}
                        planetId={planetId}
                        agentId={agentId}
                        isLimiting={cs.lastTickInvestedConstructionServices < cs.maximumConstructionServiceConsumption}
                    />
                </div>

                <RiArrowRightBoxFill className={`shrink-0 h-8 w-8 text-muted-foreground`} />

                <div className='flex flex-wrap gap-1.5 px-6 justify-center'>
                    <div className='flex flex-row w-full justify-between text-xs text-muted-foreground mb-1'>
                        <Badge
                            variant='secondary'
                            className='text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 text-[10px] px-1.5 py-0 gap-1'
                        >
                            <HardHat className='h-2.5 w-2.5' />
                            <p className='text-xs text-muted-foreground mt-0.5'>
                                MaxScale {facility.maxScale} →{' '}
                                <span className='font-medium text-foreground'>{cs.constructionTargetMaxScale}</span>
                            </p>
                        </Badge>

                        <span className='font-medium text-foreground'>{pct.toFixed(0)}%</span>
                    </div>
                    <Progress value={pct} className='h-2.5 bg-amber-100 dark:bg-amber-950/40 [&>div]:bg-amber-500' />
                </div>
            </div>
            <div className='mt-auto space-y-2'>
                <Separator />
                <Button variant='outline' size='sm' className='w-full text-xs gap-1' onClick={onCancel}>
                    Cancel Construction
                </Button>
            </div>
        </>
    );
}
