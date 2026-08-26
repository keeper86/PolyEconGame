'use client';

import { useMemo } from 'react';
import type { TooltipProps } from 'recharts';
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceDot,
    ReferenceLine,
    ResponsiveContainer,
    Text,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { CostSpringParams } from './costSpringCurve';
import {
    buildSpringCurvePoints,
    buildSpringRatioTicks,
    computeSpringDomain,
    ratioAtFullPush,
    springFraction,
} from './costSpringCurve';

const GHOST_COLOR = '#94a3b8';
const ACTIVE_COLOR = '#38bdf8';
const CURRENT_COLOR = '#fbbf24';
const FULL_PUSH_COLOR = '#f87171';
const TICK_COLOR = '#94a3b8';
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
            <div style={{ color: GHOST_COLOR }}>Saved push: {percent(point.ghost)}</div>
            <div style={{ color: ACTIVE_COLOR }}>Draft push: {percent(point.active)}</div>
        </div>
    );
}

function PriceAxisTick({
    x,
    y,
    payload,
    index,
    tickFormatter,
    textAnchor,
    verticalAnchor,
    currentRatio,
    fullRatio,
    referenceRatio,
}: {
    x?: number;
    y?: number;
    payload?: { value: number };
    index?: number;
    tickFormatter?: (value: number, index: number) => string;
    textAnchor?: 'start' | 'middle' | 'end';
    verticalAnchor?: 'start' | 'middle' | 'end';
    currentRatio?: number;
    fullRatio?: number;
    referenceRatio?: number;
}): React.ReactElement | null {
    if (x === undefined || y === undefined || payload === undefined) {
        return null;
    }
    const isMarketPrice = currentRatio !== undefined && Math.abs(payload.value - currentRatio) < 1e-6;
    const isFullPush = !isMarketPrice && fullRatio !== undefined && Math.abs(payload.value - fullRatio) < 1e-6;
    const isReference =
        !isMarketPrice &&
        !isFullPush &&
        referenceRatio !== undefined &&
        Math.abs(payload.value - referenceRatio) < 1e-6;
    const text = isMarketPrice
        ? currentRatio.toFixed(1)
        : isFullPush
          ? fullRatio.toFixed(1)
          : isReference
            ? referenceRatio.toFixed(1)
            : tickFormatter
              ? tickFormatter(payload.value, index ?? 0)
              : String(payload.value);
    const fill = isMarketPrice ? CURRENT_COLOR : isFullPush ? FULL_PUSH_COLOR : isReference ? ACTIVE_COLOR : TICK_COLOR;
    return (
        <Text
            x={x}
            y={y}
            textAnchor={textAnchor ?? 'middle'}
            verticalAnchor={verticalAnchor ?? 'start'}
            fontSize={10}
            fill={fill}
        >
            {text}
        </Text>
    );
}

export function CostSpringCurve({
    mode,
    ghost,
    active,
    currentRatio,
}: {
    mode: 'buy' | 'sell';
    ghost: CostSpringParams;
    active: CostSpringParams;
    currentRatio?: number;
}): React.ReactElement {
    const { min: domainMin, max: domainMax } = useMemo(
        () => computeSpringDomain(mode, ghost, active, currentRatio),
        [mode, ghost, active, currentRatio],
    );

    const data = useMemo(
        () => buildSpringCurvePoints(mode, ghost, active, domainMin, domainMax, SAMPLE_COUNT),
        [mode, ghost, active, domainMin, domainMax],
    );

    const currentY = currentRatio !== undefined ? springFraction(mode, active, currentRatio) : undefined;
    const showCurrent =
        currentRatio !== undefined && currentY !== undefined && currentRatio >= domainMin && currentRatio <= domainMax;

    const activeFullRatio = ratioAtFullPush(mode, active);
    const showFullPush =
        Number.isFinite(activeFullRatio) && activeFullRatio >= domainMin && activeFullRatio <= domainMax;
    const fullRatio = showFullPush ? Number(activeFullRatio.toFixed(4)) : undefined;

    const referenceRatio =
        active.reference >= domainMin && active.reference <= domainMax
            ? Number(active.reference.toFixed(4))
            : undefined;

    const highlightRatios = useMemo(
        () => [currentRatio, fullRatio, referenceRatio].filter((r): r is number => r !== undefined),
        [currentRatio, fullRatio, referenceRatio],
    );
    const xTicks = useMemo(
        () => buildSpringRatioTicks(domainMin, domainMax, highlightRatios),
        [domainMin, domainMax, highlightRatios],
    );

    const title = mode === 'buy' ? 'Ceiling spring curve' : 'Cost spring curve';

    return (
        <div className='py-1'>
            <div className='flex items-center justify-between mb-1'>
                <span className='text-[10px] uppercase tracking-wider text-muted-foreground font-semibold'>
                    {title}
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
                    <span className='flex items-center gap-1'>
                        <span className='inline-block w-2.5 h-2.5 rounded-full bg-amber-400' />
                        Market price
                    </span>
                </div>
            </div>
            <ResponsiveContainer width='100%' height={170}>
                <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <CartesianGrid
                        strokeDasharray='3 3'
                        stroke='#334155'
                        verticalCoordinatesGenerator={({ xAxis }) => {
                            if (!xAxis) {
                                return [];
                            }
                            const excluded = highlightRatios.map((ratio) => xAxis.scale(ratio));
                            return xAxis.ticks
                                .map((value: number) => xAxis.scale(value))
                                .filter((coord: number) =>
                                    excluded.every((excludedCoord) => Math.abs(coord - excludedCoord) > 0.5),
                                );
                        }}
                    />
                    <XAxis
                        dataKey='ratio'
                        type='number'
                        domain={[domainMin, domainMax]}
                        ticks={xTicks}
                        interval={0}
                        tick={
                            <PriceAxisTick
                                currentRatio={currentRatio}
                                fullRatio={fullRatio}
                                referenceRatio={referenceRatio}
                            />
                        }
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
                        label={{
                            value: 'Spring push',
                            angle: -90,
                            position: 'insideLeft',
                            fontSize: 10,
                            fill: '#64748b',
                        }}
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
                    <Area
                        type='monotone'
                        dataKey='active'
                        stroke={ACTIVE_COLOR}
                        strokeWidth={2}
                        dot={false}
                        fill={'#ef444421'}
                        isAnimationActive={false}
                    />
                    {fullRatio !== undefined && (
                        <ReferenceLine
                            x={fullRatio}
                            stroke={FULL_PUSH_COLOR}
                            strokeDasharray='3 3'
                            strokeOpacity={0.7}
                        />
                    )}
                    {fullRatio !== undefined && (
                        <ReferenceDot
                            x={fullRatio}
                            y={1}
                            r={4}
                            fill={FULL_PUSH_COLOR}
                            stroke='#0f172a'
                            strokeWidth={2}
                        />
                    )}
                    {referenceRatio !== undefined && (
                        <ReferenceLine
                            x={referenceRatio}
                            stroke={ACTIVE_COLOR}
                            strokeDasharray='3 3'
                            strokeOpacity={0.7}
                        />
                    )}
                    {referenceRatio !== undefined && (
                        <ReferenceDot
                            x={referenceRatio}
                            y={0}
                            r={4}
                            fill={ACTIVE_COLOR}
                            stroke='#0f172a'
                            strokeWidth={2}
                        />
                    )}
                    {showCurrent && (
                        <ReferenceLine
                            x={currentRatio}
                            stroke={CURRENT_COLOR}
                            strokeDasharray='3 3'
                            strokeOpacity={0.7}
                        />
                    )}
                    {showCurrent && (
                        <ReferenceDot
                            x={currentRatio}
                            y={currentY}
                            r={6}
                            fill={CURRENT_COLOR}
                            fillOpacity={0.15}
                            stroke='none'
                        />
                    )}
                    {showCurrent && (
                        <ReferenceDot
                            x={currentRatio}
                            y={currentY}
                            r={4}
                            fill={CURRENT_COLOR}
                            stroke='#0f172a'
                            strokeWidth={2}
                        />
                    )}
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
