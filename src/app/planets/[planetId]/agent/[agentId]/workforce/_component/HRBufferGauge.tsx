'use client';

import { formatNumberWithUnit } from '@/lib/utils';
import { HR_BUFFER_CAPACITY_MULTIPLIER } from '@/simulation/constants';
import type { ManagementFacility } from '@/simulation/planet/facility';
import { PRODUCED_QUANTITY } from '@/simulation/planet/specialFacilities';
import React, { useMemo } from 'react';
import GaugeComponent from 'react-gauge-component';

const ZONE_RED = '#ef4444';
const ZONE_AMBER = '#f59e0b';
const ZONE_GREEN = '#22c55e';
const ZONE_BLUE = '#3b82f6';
const tickStyle = 'text-outline-strong text-xs text-muted-foreground translate-y-[2px]';

// TODO: Remove hrDepartment, we only need scale.
export function HRBufferGauge({
    buffer,
    demand,
    hrDepartment,
    maxScaleOverride,
}: {
    buffer: number;
    demand: number;
    hrDepartment: ManagementFacility;
    maxScaleOverride?: number;
}): React.ReactElement {
    const { maxValue, subArcs, ticks } = useMemo(() => {
        const scale = maxScaleOverride ?? hrDepartment.maxScale;
        const maxValue = scale * PRODUCED_QUANTITY * HR_BUFFER_CAPACITY_MULTIPLIER;
        const ratio = demand / maxValue;
        const zones: { limit?: number; color: string }[] = [];
        const ticks: { value: number; valueConfig: { renderContent: () => React.ReactNode } }[] = [];

        if (demand === 0 || ratio > 0.05) {
            zones.push({ limit: 0, color: ZONE_RED });
            ticks.push({
                value: 0,
                valueConfig: {
                    renderContent: () => <span className={tickStyle}>0</span>,
                },
            });
        }
        if (demand > 0 && demand <= maxValue) {
            zones.push({ limit: demand, color: ZONE_RED });
            ticks.push({
                value: demand,
                valueConfig: {
                    renderContent: () => <span className={tickStyle + ' translate-x-[-4px]'}>1 day</span>,
                },
            });
            if (ratio > 0.05) {
                zones.push({ limit: demand * 2, color: ZONE_AMBER });
                ticks.push({
                    value: demand * 2,
                    valueConfig: {
                        renderContent: () => <span className={tickStyle + ' translate-x-[-10px]'}>2 days</span>,
                    },
                });
                if (ratio > 0.05) {
                    zones.push({ limit: demand * 4, color: ZONE_GREEN });
                    ticks.push({
                        value: demand * 4,
                        valueConfig: {
                            renderContent: () => <span className={tickStyle}>4 days</span>,
                        },
                    });
                }
            }
        }

        zones.push({ color: ZONE_BLUE });
        ticks.push({
            value: maxValue,
            valueConfig: {
                renderContent: () => (
                    <span className={tickStyle + ' translate-x-[14px]'}>
                        {maxValue > 0 && demand > 0 ? formatNumberWithUnit(maxValue / demand, 'days') : 'max'}
                    </span>
                ),
            },
        });
        return { maxValue, subArcs: zones, ticks };
    }, [demand, hrDepartment.maxScale, maxScaleOverride]);

    return (
        <div className='flex flex-col items-center gap-1 py-2 translate-y-[-2px]'>
            <div className='h-[120px] w-[220px] '>
                <GaugeComponent
                    type='radial'
                    value={Math.max(0, buffer)}
                    minValue={0}
                    maxValue={maxValue}
                    arc={{
                        width: 0.3,
                        cornerRadius: 1,
                        padding: 0,
                        subArcs,
                        subArcsStrokeWidth: 1,
                        subArcsStrokeColor: '#1f1f23',
                    }}
                    pointer={{
                        type: 'needle',
                        width: 14,
                        length: 0.66,
                        strokeWidth: 1,
                        strokeColor: '#1f1f23',
                    }}
                    labels={{
                        valueLabel: { hide: true },
                        tickLabels: {
                            hideMinMax: true,
                            ticks,
                            defaultTickValueConfig: { hide: false },
                            defaultTickLineConfig: { hide: false, distanceFromText: 22, length: 3, width: 3 },
                        },
                    }}
                />
            </div>
        </div>
    );
}
