'use client';

import { useMemo } from 'react';
import type { TooltipProps } from 'recharts';
import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceDot,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { buildVolumeFractionPoints, computeVolumeFractionDomain, volumeFractionAt } from './volumeFractionCurve';
import type { VolumeFractionParams } from './volumeFractionCurve';

const GHOST_COLOR = '#94a3b8';
const ACTIVE_COLOR = '#38bdf8';
const CURRENT_COLOR = '#fbbf24';
const SAMPLE_COUNT = 100;

function percent(v: number): string {
    return `${Math.round(v * 100)}%`;
}

function CurveTooltip({ active, payload }: TooltipProps<number, string>) {
    if (!active || !payload || payload.length === 0) {
        return null;
    }
    const point = payload[0]?.payload as { ratio: number; ghost: number; active: number } | undefined;
    if (!point) {
        return null;
    }
    return (
        <div
            style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '11px',
                color: '#94a3b8',
            }}
        >
            <div>Price/Cost: {point.ratio.toFixed(2)}</div>
            <div style={{ color: GHOST_COLOR }}>Saved volume: {percent(point.ghost)}</div>
            <div style={{ color: ACTIVE_COLOR }}>Draft volume: {percent(point.active)}</div>
        </div>
    );
}

export function VolumeFractionCurve({
    mode,
    ghost,
    active,
    currentRatio,
}: {
    mode: 'buy' | 'sell';
    ghost: VolumeFractionParams;
    active: VolumeFractionParams;
    currentRatio?: number;
}): React.ReactElement {
    const domainMax = useMemo(
        () => computeVolumeFractionDomain(ghost, active, currentRatio),
        [ghost, active, currentRatio],
    );

    const data = useMemo(
        () => buildVolumeFractionPoints(mode, ghost, active, domainMax, SAMPLE_COUNT),
        [mode, ghost, active, domainMax],
    );

    const currentY = currentRatio !== undefined ? volumeFractionAt(mode, ghost, currentRatio) : undefined;

    return (
        <div className='py-1'>
            <div className='flex items-center justify-between mb-1'>
                <span className='text-[10px] uppercase tracking-wider text-muted-foreground font-semibold'>
                    Volume fraction curve
                </span>
                <div className='flex items-center gap-3 text-[10px] text-slate-400'>
                    <span className='flex items-center gap-1'>
                        <span className='inline-block w-2.5 h-0.5 bg-slate-400' />
                        Saved
                    </span>
                    <span className='flex items-center gap-1'>
                        <span className='inline-block w-2.5 h-0.5 bg-sky-400' />
                        Draft
                    </span>
                </div>
            </div>
            <ResponsiveContainer width='100%' height={170}>
                <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray='3 3' stroke='#334155' />
                    <XAxis
                        dataKey='ratio'
                        type='number'
                        domain={[0, domainMax]}
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        tickFormatter={(v) => v.toFixed(1)}
                        axisLine={false}
                        tickLine={false}
                        label={{
                            value: 'Price / Cost',
                            position: 'insideBottom',
                            offset: -2,
                            fontSize: 10,
                            fill: '#64748b',
                        }}
                    />
                    <YAxis
                        type='number'
                        domain={[0, 1]}
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        tickFormatter={percent}
                        axisLine={false}
                        tickLine={false}
                        width={38}
                        label={{ value: 'Volume', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#64748b' }}
                    />
                    <Tooltip content={<CurveTooltip />} cursor={{ stroke: '#475569', strokeDasharray: '4 4' }} />
                    <Line
                        type='monotone'
                        dataKey='ghost'
                        stroke={GHOST_COLOR}
                        strokeWidth={1.5}
                        strokeDasharray='5 4'
                        dot={false}
                        isAnimationActive={false}
                    />
                    <Line
                        type='monotone'
                        dataKey='active'
                        stroke={ACTIVE_COLOR}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                    />
                    {currentRatio !== undefined && currentY !== undefined && (
                        <>
                            <ReferenceLine
                                x={currentRatio}
                                stroke={CURRENT_COLOR}
                                strokeDasharray='3 3'
                                strokeOpacity={0.7}
                            />
                            <ReferenceLine
                                y={currentY}
                                stroke={CURRENT_COLOR}
                                strokeDasharray='3 3'
                                strokeOpacity={0.7}
                            />
                            <ReferenceDot
                                x={currentRatio}
                                y={currentY}
                                r={4.5}
                                fill={CURRENT_COLOR}
                                stroke='#0f172a'
                                strokeWidth={1.5}
                                isFront
                                label={{
                                    value: `${currentRatio.toFixed(2)} → ${percent(currentY)}`,
                                    position: 'top',
                                    fontSize: 9,
                                    fill: CURRENT_COLOR,
                                }}
                            />
                        </>
                    )}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
