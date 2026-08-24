'use client';

import { formatNumberWithUnit } from '@/lib/utils';
import { STORAGE_BUFFER_CAPACITY_MULTIPLIER } from '@/simulation/constants';
import type { ManagementFacility } from '@/simulation/planet/facility';
import { PRODUCED_STORAGE_QUANTITY } from '@/simulation/planet/specialFacilities';
import React, { useMemo } from 'react';
import GaugeComponent from 'react-gauge-component';
import { getRadialNudge, resolveTickLabels, resolveZones, type TickLabelCandidate } from '../../_component/gaugeTicks';

const ZONE_RED = '#ef4444';
const ZONE_AMBER = '#f59e0b';
const ZONE_GREEN = '#22c55e';
const ZONE_BLUE = '#3b82f6';

const tickStyle = 'text-outline-strong text-xs text-muted-foreground inline-block';

export function StorageBufferGauge({
    buffer,
    demand,
    department,
    maxScaleOverride,
}: {
    buffer: number;
    demand: number;
    department: ManagementFacility;
    maxScaleOverride?: number;
}): React.ReactElement {
    const { maxValue, subArcs, ticks } = useMemo(() => {
        const scale = maxScaleOverride ?? department.maxScale;
        const maxValue = scale * PRODUCED_STORAGE_QUANTITY * STORAGE_BUFFER_CAPACITY_MULTIPLIER;
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
                        {maxValue > 0 ? formatNumberWithUnit(maxValue, 'tonnes') : 'max'}
                    </span>
                ),
            },
            {
                value: 0,
                priority: 0,
                renderContent: () => (
                    <span className={tickStyle} style={getRadialNudge(0, maxValue)}>
                        {formatNumberWithUnit(0, 'tonnes')}
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
                            {formatNumberWithUnit(demand, 'tonnes')}
                        </span>
                    ),
                },
                {
                    value: demand * 2,
                    priority: 3,
                    renderContent: () => (
                        <span className={tickStyle} style={getRadialNudge(demand * 2, maxValue)}>
                            {formatNumberWithUnit(demand * 2, 'tonnes')}
                        </span>
                    ),
                },
                {
                    value: demand * 4,
                    priority: 4,
                    renderContent: () => (
                        <span className={tickStyle} style={getRadialNudge(demand * 4, maxValue)}>
                            {formatNumberWithUnit(demand * 4, 'tonnes')}
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
    }, [demand, department.maxScale, maxScaleOverride]);

    return (
        <div className='flex flex-col items-center gap-1 py-2 translate-y-[-1px]'>
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
