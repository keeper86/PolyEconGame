'use client';

import { ProductQuantity } from '@/components/client/ProductQuantity';
import { Progress } from '@/components/ui/progress';
import type { Facility } from '@/simulation/planet/facility';
import {
    facilityMaintenanceConsumptionPerTick,
    facilityRestorationCapacityPerTick,
} from '@/simulation/planet/facilityMaintenance';
import { constructionServiceResourceType, maintenanceServiceResourceType } from '@/simulation/planet/services';
import React from 'react';
import { useTranslations } from 'next-intl';
import { RiArrowRightBoxFill } from 'react-icons/ri';
import { ConditionBar } from './ConditionBar';

export function FacilityConditionRow({
    facility,
    planetId,
    agentId,
}: {
    facility: Facility;
    planetId: string;
    agentId: string;
}): React.ReactElement {
    const t = useTranslations('Production');
    const maxMaintenance = facility.maxMaintenance;
    const status = facility.maintenanceStatus;

    const expectedMaintenance = facilityMaintenanceConsumptionPerTick(facility);
    const maintenanceEfficiency =
        expectedMaintenance > 0 ? Math.min(1, facility.lastTickMaintenanceConsumption / expectedMaintenance) : 0;
    const maintenanceIsLimiting = facility.lastTickMaintenanceConsumption < expectedMaintenance;

    const restoreCapacity = facilityRestorationCapacityPerTick(facility);
    const restoreEfficiency =
        restoreCapacity > 0 ? Math.min(1, facility.lastTickRestorationConsumption / restoreCapacity) : 0;
    const restoreIsLimiting = facility.lastTickRestorationConsumption < restoreCapacity;

    return (
        <span className='' data-tour='facility-maintenance-row'>
            <div className='grid w-full items-center gap-x-2 py-2' style={{ gridTemplateColumns: '1fr auto 3fr' }}>
                <div className='flex flex-wrap gap-1.5 justify-center'>
                    <ProductQuantity
                        quantity={facility.lastTickMaintenanceConsumption}
                        resource={maintenanceServiceResourceType}
                        efficiency={maintenanceEfficiency}
                        planetId={planetId}
                        agentId={agentId}
                        isLimiting={maintenanceIsLimiting}
                    />
                </div>

                <RiArrowRightBoxFill className='shrink-0 h-8 w-8 text-muted-foreground' />

                <div className='flex flex-wrap gap-1.5 sm:pl-4 justify-center'>
                    <ConditionBar status={status} max={maxMaintenance} />
                </div>
            </div>

            {maxMaintenance < 1 && (
                <div className='grid w-full items-center gap-x-2 py-2' style={{ gridTemplateColumns: '1fr auto 3fr' }}>
                    <div className='flex flex-wrap gap-1.5 justify-center'>
                        <ProductQuantity
                            quantity={facility.lastTickRestorationConsumption}
                            resource={constructionServiceResourceType}
                            efficiency={restoreEfficiency}
                            planetId={planetId}
                            agentId={agentId}
                            isLimiting={restoreIsLimiting}
                        />
                    </div>

                    <RiArrowRightBoxFill className='shrink-0 h-8 w-8 text-muted-foreground' />

                    <div className='flex flex-wrap gap-1.5 sm:pl-4 justify-center'>
                        <div className='flex flex-row w-full justify-between text-xs text-muted-foreground mb-1'>
                            <span>{t('restoration')}</span>
                            <span className='font-medium text-foreground'>{Math.round(maxMaintenance * 100)}%</span>
                        </div>
                        <Progress
                            value={Math.min(100, maxMaintenance * 100)}
                            className='h-2.5 bg-amber-100 dark:bg-amber-950/40 [&>div]:bg-amber-500'
                        />
                    </div>
                </div>
            )}
        </span>
    );
}
