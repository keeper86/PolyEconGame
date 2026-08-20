'use client';

import { formatNumberWithUnit } from '@/lib/utils';
import { HR_BUFFER_CAPACITY_MULTIPLIER } from '@/simulation/constants';
import type { ManagementFacility } from '@/simulation/planet/facility';
import { PRODUCED_HR_QUANTITY } from '@/simulation/planet/specialFacilities';
import React, { useMemo } from 'react';
import GaugeComponent from 'react-gauge-component';
import { getRadialNudge, resolveTickLabels, resolveZones, type TickLabelCandidate } from '../../_component/gaugeTicks';

const ZONE_RED = '#ef4444';
const ZONE_AMBER = '#f59e0b';
const ZONE_GREEN = '#22c55e';
const ZONE_BLUE = '#3b82f6';

const tickStyle = 'text-outline-strong text-xs text-muted-foreground inline-block';

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
        const maxValue = scale * PRODUCED_HR_QUANTITY * HR_BUFFER_CAPACITY_MULTIPLIER;
        const subArcs = resolveZones(
            [
                { from: 0, to: demand, color: ZONE_RED },
                { from: demand, to: demand * 2, color: ZONE_AMBER },
                { from: demand * 2, to: demand * 4, color: ZONE_GREEN },
                { from: demand * 4, to: maxValue, color: ZONE_BLUE },
            ],
            maxValue,
        );

        const candidates: TickLabelCandidate[] = [
            {
                value: maxValue,
                priority: 0,
                renderContent: () => (
                    <span className={tickStyle} style={getRadialNudge(maxValue, maxValue)}>
                        {maxValue > 0 && demand > 0 ? formatNumberWithUnit(maxValue / demand, 'days') : 'max'}
                    </span>
                ),
            },
            {
                value: 0,
                priority: 0,
                renderContent: () => (
                    <span className={tickStyle} style={getRadialNudge(0, maxValue)}>
                        0 days
                    </span>
                ),
            },
        ];

        if (demand > 0) {
            candidates.push(
                {
                    value: demand,
                    priority: 1,
                    renderContent: () => (
                        <span className={tickStyle} style={getRadialNudge(demand, maxValue)}>
                            1 day
                        </span>
                    ),
                },
                {
                    value: demand * 2,
                    priority: 3,
                    renderContent: () => (
                        <span className={tickStyle} style={getRadialNudge(demand * 2, maxValue)}>
                            2 days
                        </span>
                    ),
                },
                {
                    value: demand * 4,
                    priority: 4,
                    renderContent: () => (
                        <span className={tickStyle} style={getRadialNudge(demand * 4, maxValue)}>
                            4 days
                        </span>
                    ),
                },
            );
        }

        const ticks = resolveTickLabels(candidates, maxValue).map(({ value, renderContent }) => ({
            value,
            valueConfig: { renderContent },
        }));

        return { maxValue, subArcs, ticks };
    }, [demand, hrDepartment.maxScale, maxScaleOverride]);

    return (
        <div className='flex flex-col items-center gap-1 py-2 translate-y-[-3px]'>
            <div className='h-[120px] w-[220px]'>
                <GaugeComponent
                    type='radial'
                    style={{ overflow: 'visible' }}
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
