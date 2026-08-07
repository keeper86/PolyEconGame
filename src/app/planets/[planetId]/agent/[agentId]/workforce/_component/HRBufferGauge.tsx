'use client';

import { HR_BUFFER_CAPACITY_MULTIPLIER } from '@/simulation/constants';
import type { ManagementFacility } from '@/simulation/planet/facility';
import { PRODUCED_QUANTITY } from '@/simulation/planet/specialFacilities';
import React, { useMemo } from 'react';
import GaugeComponent from 'react-gauge-component';

const ZONE_RED = '#ef4444';
const ZONE_AMBER = '#f59e0b';
const ZONE_GREEN = '#22c55e';
const ZONE_BLUE = '#3b82f6';

export function HRBufferGauge({
    buffer,
    demand,
    hrDepartment,
}: {
    buffer: number;
    demand: number;
    hrDepartment: ManagementFacility;
}): React.ReactElement {
    const { maxValue, subArcs } = useMemo(() => {
        const maxValue = hrDepartment.maxScale * PRODUCED_QUANTITY * HR_BUFFER_CAPACITY_MULTIPLIER;
        const zones: { limit?: number; color: string }[] = [];
        if (demand > 0) {
            zones.push({ limit: demand, color: ZONE_RED });
            zones.push({ limit: demand * 2, color: ZONE_AMBER });
            zones.push({ limit: demand * 4, color: ZONE_GREEN });
        }
        zones.push({ color: ZONE_BLUE });
        return { maxValue, subArcs: zones };
    }, [demand, hrDepartment.maxScale]);

    return (
        <div className='flex flex-col items-center gap-1 py-2'>
            <div className='h-[110px] w-[180px]'>
                <GaugeComponent
                    type='radial'
                    value={Math.max(0, buffer)}
                    minValue={0}
                    maxValue={maxValue}
                    arc={{ width: 0.25, cornerRadius: 1, padding: 0.02, subArcs }}
                    pointer={{
                        type: 'needle',
                        animate: true,
                        animationDuration: 800,
                        width: 14,
                        length: 0.66,
                    }}
                    labels={{
                        valueLabel: { hide: true },
                        tickLabels: {
                            hideMinMax: true,
                            defaultTickValueConfig: { hide: true },
                            defaultTickLineConfig: { hide: true },
                        },
                    }}
                />
            </div>
        </div>
    );
}
