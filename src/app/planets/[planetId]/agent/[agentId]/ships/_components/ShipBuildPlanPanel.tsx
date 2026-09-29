'use client';

import { ProductQuantity } from '@/components/client/ProductQuantity';
import type { ShipType } from '@/simulation/ships/ships';
import { Clock, Users } from 'lucide-react';
import React from 'react';
import { useTranslations } from 'next-intl';

function totalCrew(requiredCrew: ShipType['requiredCrew']): number {
    return Object.values(requiredCrew).reduce((sum, n) => sum + n, 0);
}

export function ShipBuildPlanPanel({
    shipType,
    planetId,
    agentId,
}: {
    shipType: ShipType;
    planetId: string;
    agentId: string;
}): React.ReactElement {
    const t = useTranslations('Ships');
    return (
        <div className='rounded-md border bg-muted/30 p-3 space-y-2'>
            <div className='flex flex-wrap items-center gap-3 text-xs text-muted-foreground'>
                <span className='flex items-center gap-1'>
                    <Clock className='h-3.5 w-3.5' />
                    {t('build.buildTimeLine', { days: shipType.buildingTime })}
                </span>
                <span className='flex items-center gap-1'>
                    <Users className='h-3.5 w-3.5' />
                    {t('build.crewLine', { count: totalCrew(shipType.requiredCrew) })}
                </span>
            </div>
            <div className='flex flex-wrap gap-1.5'>
                {shipType.buildingCost.map((cost) => (
                    <ProductQuantity
                        key={cost.resource.name}
                        resource={cost.resource}
                        quantity={cost.quantity}
                        efficiency={1}
                        isLimiting={false}
                        planetId={planetId}
                        agentId={agentId}
                        neutral
                    />
                ))}
            </div>
        </div>
    );
}
