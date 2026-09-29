'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
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
const MARKET_COLOR = '#94a3b8';
const OWN_PRICE_COLOR = '#fbbf24';
const HARD_CAP_COLOR = '#f87171';
const TICK_COLOR = '#94a3b8';
const SAMPLE_COUNT = 100;

function percent(v: number): string {
    return `${Math.round(v * 100)}%`;
}

function CurveTooltip({ active, payload }: TooltipProps<number, string>) {
    const t = useTranslations('Market');
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
            <div>
                {t('priceOverCostLabel')} {point.ratio.toFixed(2)}
            </div>
            <div style={{ color: GHOST_COLOR }}>
                {t('savedPush')} {percent(point.ghost)}
            </div>
            <div style={{ color: ACTIVE_COLOR }}>
                {t('draftPush')} {percent(point.active)}
            </div>
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
    ownRatio,
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
    ownRatio?: number;
    fullRatio?: number;
    referenceRatio?: number;
}): React.ReactElement | null {
    if (x === undefined || y === undefined || payload === undefined) {
        return null;
    }
    if (currentRatio !== undefined && Math.abs(payload.value - currentRatio) < 1e-6) {
        return null;
    }
    const isOwnPrice = ownRatio !== undefined && Math.abs(payload.value - ownRatio) < 1e-6;
    const isHardCap = !isOwnPrice && fullRatio !== undefined && Math.abs(payload.value - fullRatio) < 1e-6;
    const isSoftMax =
        !isOwnPrice && !isHardCap && referenceRatio !== undefined && Math.abs(payload.value - referenceRatio) < 1e-6;
    const text = isOwnPrice
        ? ownRatio.toFixed(1)
        : isHardCap
          ? fullRatio.toFixed(1)
          : isSoftMax
            ? referenceRatio.toFixed(1)
            : tickFormatter
              ? tickFormatter(payload.value, index ?? 0)
              : String(payload.value);
    const fill = isOwnPrice ? OWN_PRICE_COLOR : isHardCap ? HARD_CAP_COLOR : isSoftMax ? ACTIVE_COLOR : TICK_COLOR;
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
    ownRatio,
}: {
    mode: 'buy' | 'sell';
    ghost: CostSpringParams;
    active: CostSpringParams;
    currentRatio?: number;
    ownRatio?: number;
}): React.ReactElement {
    const t = useTranslations('Market');
    const { min: domainMin, max: domainMax } = useMemo(
        () => computeSpringDomain(mode, ghost, active, currentRatio, ownRatio),
        [mode, ghost, active, currentRatio, ownRatio],
    );

    const data = useMemo(
        () => buildSpringCurvePoints(mode, ghost, active, domainMin, domainMax, SAMPLE_COUNT),
        [mode, ghost, active, domainMin, domainMax],
    );

    const currentY = currentRatio !== undefined ? springFraction(mode, active, currentRatio) : undefined;
    const showCurrent =
        currentRatio !== undefined && currentY !== undefined && currentRatio >= domainMin && currentRatio <= domainMax;

    const ownY = ownRatio !== undefined ? springFraction(mode, active, ownRatio) : undefined;
    const showOwn = ownRatio !== undefined && ownY !== undefined && ownRatio >= domainMin && ownRatio <= domainMax;

    const activeFullRatio = ratioAtFullPush(mode, active);
    const showFullPush =
        Number.isFinite(activeFullRatio) && activeFullRatio >= domainMin && activeFullRatio <= domainMax;
    const fullRatio = showFullPush ? Number(activeFullRatio.toFixed(4)) : undefined;

    const referenceRatio =
        active.reference >= domainMin && active.reference <= domainMax
            ? Number(active.reference.toFixed(4))
            : undefined;

    const highlightRatios = useMemo(
        () => [ownRatio, currentRatio, fullRatio, referenceRatio].filter((r): r is number => r !== undefined),
        [ownRatio, currentRatio, fullRatio, referenceRatio],
    );
    const xTicks = useMemo(
        () => buildSpringRatioTicks(domainMin, domainMax, highlightRatios),
        [domainMin, domainMax, highlightRatios],
    );

    const topTicks = useMemo(
        () => [fullRatio, referenceRatio].filter((r): r is number => r !== undefined).sort((a, b) => a - b),
        [fullRatio, referenceRatio],
    );
    const bottomTicks = useMemo(
        () => xTicks.filter((v) => !topTicks.some((r) => Math.abs(v - r) < 1e-6)),
        [xTicks, topTicks],
    );

    const title = mode === 'buy' ? t('ceilingSpringCurve') : t('costSpringCurve');

    return (
        <div className='py-1'>
            <div className='flex items-center justify-between'>
                <span className='text-[10px] uppercase tracking-wider text-muted-foreground font-semibold'>
                    {title}
                </span>
                <div className='flex items-center gap-3 text-[10px] text-slate-400'>
                    <span className='flex items-center gap-1'>
                        <span className='inline-block w-2.5 h-0.5 bg-slate-400' />
                        {t('saved')}
                    </span>
                    <span className='flex items-center gap-1'>
                        <span className='inline-block w-2.5 h-0.5 bg-sky-400' />
                        {t('draft')}
                    </span>
                </div>
            </div>
            <ResponsiveContainer width='100%' height={170}>
                <ComposedChart data={data} margin={{ top: 4.5, right: 8, bottom: 8, left: 8 }}>
                    <CartesianGrid
                        strokeDasharray='3 3'
                        stroke='#334155'
                        verticalCoordinatesGenerator={({ xAxis }) => {
                            if (!xAxis) {
                                return [];
                            }
                            const excluded = highlightRatios.map((ratio) => xAxis.scale(ratio));
                            return xTicks
                                .map((value: number) => xAxis.scale(value))
                                .filter((coord: number) =>
                                    excluded.every((excludedCoord) => Math.abs(coord - excludedCoord) > 0.5),
                                );
                        }}
                    />
                    <XAxis
                        xAxisId={0}
                        className='cost-spring-bottom-axis'
                        dataKey='ratio'
                        type='number'
                        domain={[domainMin, domainMax]}
                        ticks={bottomTicks}
                        interval={0}
                        tick={
                            <PriceAxisTick
                                currentRatio={currentRatio}
                                ownRatio={ownRatio}
                                fullRatio={fullRatio}
                                referenceRatio={referenceRatio}
                            />
                        }
                        tickFormatter={(v) => v.toFixed(1)}
                        axisLine={false}
                        tickLine={false}
                        label={{
                            value: t('priceOverCostAxis'),
                            position: 'insideBottom',
                            offset: -2,
                            fontSize: 10,
                            fill: '#64748b',
                        }}
                    />
                    {topTicks.length > 0 && (
                        <XAxis
                            xAxisId={1}
                            className='cost-spring-top-axis'
                            orientation='top'
                            dataKey='ratio'
                            type='number'
                            domain={[domainMin, domainMax]}
                            ticks={topTicks}
                            interval={0}
                            height={18}
                            tick={
                                <PriceAxisTick
                                    currentRatio={currentRatio}
                                    ownRatio={ownRatio}
                                    fullRatio={fullRatio}
                                    referenceRatio={referenceRatio}
                                />
                            }
                            tickFormatter={(v) => v.toFixed(1)}
                            axisLine={false}
                            tickLine={false}
                        />
                    )}
                    <YAxis
                        type='number'
                        domain={[0, 1]}
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        tickFormatter={percent}
                        axisLine={false}
                        tickLine={false}
                        width={38}
                        label={{
                            value: t('springPushAxis'),
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
                            stroke={HARD_CAP_COLOR}
                            strokeDasharray='3 3'
                            strokeOpacity={0.7}
                        />
                    )}
                    {fullRatio !== undefined && (
                        <ReferenceDot
                            x={fullRatio}
                            y={1}
                            r={4}
                            fill={HARD_CAP_COLOR}
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
                    {showOwn && (
                        <ReferenceLine
                            x={ownRatio}
                            stroke={OWN_PRICE_COLOR}
                            strokeDasharray='3 3'
                            strokeOpacity={0.7}
                        />
                    )}
                    {showOwn && (
                        <ReferenceDot
                            x={ownRatio}
                            y={ownY}
                            r={5}
                            fill={OWN_PRICE_COLOR}
                            stroke='#0f172a'
                            strokeWidth={1}
                        />
                    )}
                    {showCurrent && (
                        <ReferenceLine
                            x={currentRatio}
                            stroke={MARKET_COLOR}
                            strokeDasharray='3 3'
                            strokeOpacity={0.7}
                        />
                    )}
                    {showCurrent && (
                        <ReferenceDot
                            x={currentRatio}
                            y={currentY}
                            r={3}
                            fill={MARKET_COLOR}
                            stroke='#0f172a'
                            strokeWidth={1}
                        />
                    )}
                </ComposedChart>
            </ResponsiveContainer>
            <div className='flex items-center justify-end gap-3 text-[10px] text-slate-400 pt-1'>
                <span className='flex items-center gap-1'>
                    <span className='inline-block w-2.5 h-2.5 rounded-full bg-slate-400' />
                    {t('market')}
                </span>
                <span className='flex items-center gap-1'>
                    <span className='inline-block w-2.5 h-2.5 rounded-full bg-amber-400' />
                    {t('own')}
                </span>
                <span className='flex items-center gap-1'>
                    <span className='inline-block w-2.5 h-2.5 rounded-full bg-sky-400' />
                    {t('softMax')}
                </span>
                <span className='flex items-center gap-1'>
                    <span className='inline-block w-2.5 h-2.5 rounded-full bg-red-400' />
                    {t('hardCap')}
                </span>
            </div>
        </div>
    );
}
