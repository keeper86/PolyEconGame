'use client';

import { ProductQuantity } from '@/components/client/ProductQuantity';
import { Progress } from '@/components/ui/progress';
import type { Facility } from '@/simulation/planet/facility';
import {
    facilityMaintenanceConsumptionPerTick,
    facilityRestorationCapacityPerTick,
} from '@/simulation/planet/facilityMaintenance';
import { constructionServiceResourceType, maintenanceServiceResourceType } from '@/simulation/planet/services';
import { Wrench } from 'lucide-react';
import React from 'react';
import { RiArrowRightBoxFill } from 'react-icons/ri';

function conditionTone(status: number): { text: string; bar: string } {
    if (status >= 0.75) {
        return { text: 'text-green-600', bar: '[&>div]:bg-green-500' };
    }
    if (status >= 0.4) {
        return { text: 'text-yellow-600', bar: '[&>div]:bg-yellow-500' };
    }
    return { text: 'text-red-600', bar: '[&>div]:bg-red-500' };
}

export function FacilityConditionRow({
    facility,
    planetId,
    agentId,
}: {
    facility: Facility;
    planetId: string;
    agentId: string;
}): React.ReactElement {
    const maxMaintenance = facility.maxMaintenance;
    const status = facility.maintenanceStatus;
    const tone = conditionTone(status);
    const fillPct = maxMaintenance > 0 ? Math.min(100, Math.max(0, (status / maxMaintenance) * 100)) : 0;

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
                    <div className='flex flex-row w-full justify-between text-xs text-muted-foreground mb-1'>
                        <span className='flex items-center gap-1.5'>
                            <Wrench className='h-3.5 w-3.5' />
                            Condition
                        </span>
                        <span className={`font-medium ${tone.text}`}>
                            {Math.round(status * 100)}% / {Math.round(maxMaintenance * 100)}% max
                        </span>
                    </div>
                    <Progress value={fillPct} className={`h-2.5 ${tone.bar}`} />
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
                            <span>Restoration</span>
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
