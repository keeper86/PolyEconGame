'use client';

import React, { useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { useIsSmallScreen } from '@/hooks/useMobile';
import { formatNumberWithUnit } from '@/lib/utils';
import { SERVICE_DEFINITIONS } from '@/simulation/market/populationDemand';
import { educationLevelKeys } from '@/simulation/population/education';
import type { ServiceName } from '@/simulation/population/population';
import { OCCUPATIONS } from '@/simulation/population/population';
import { EDU_COLORS, EDU_LABELS, OCC_COLORS, OCC_LABELS } from './CohortFilter';
import type { AggRow, GroupMode } from './demographicsTypes';
import { GV_FOOD, GV_POP, GV_STARV } from './demographicsTypes';

const BANDS = [
    { key: 'fatalStarvation', label: 'Fatal', color: '#7f1d1d' },
    { key: 'severeStarvation', label: 'Severe', color: '#b91c1c' },
    { key: 'seriousStarvation', label: 'Serious', color: '#ea580c' },
    { key: 'moderateStarvation', label: 'Moderate', color: '#f59e0b' },
    { key: 'lightStarvation', label: 'Light', color: '#d9e70eff' },
    { key: 'noStarvation', label: 'None', color: '#16a34a' },
] as const;

function classifyBand(starvationLevel: number): number {
    if (starvationLevel > 0.9) {
        return 0;
    }
    if (starvationLevel > 0.75) {
        return 1;
    }
    if (starvationLevel > 0.5) {
        return 2;
    }
    if (starvationLevel > 0.25) {
        return 3;
    }
    if (starvationLevel > 0.05) {
        return 4;
    }
    return 5;
}

const formatPct = (n: number): string => `${(n * 100).toFixed(0)}%`;

type ChartRow = Record<string, number>;

interface SegmentedBarProps {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    payload?: ChartRow;
    groupKey: string;
}

function mergePairs(rows: ChartRow[], groupKeys: readonly string[]): ChartRow[] {
    const result: ChartRow[] = [];
    for (let i = 0; i < rows.length; i += 2) {
        const a = rows[i];
        const b = rows[i + 1];
        if (!b) {
            result.push(a);
            continue;
        }
        const merged: ChartRow = { age: a.age };

        for (const gk of groupKeys) {
            const aTotal = a[`${gk}_total`] ?? 0;
            const bTotal = b[`${gk}_total`] ?? 0;
            const total = aTotal + bTotal;
            merged[`${gk}_total`] = total;

            const aAvgStarv = a[`${gk}_avgStarvation`] ?? 0;
            const bAvgStarv = b[`${gk}_avgStarvation`] ?? 0;
            merged[`${gk}_avgStarvation`] = total > 0 ? (aAvgStarv * aTotal + bAvgStarv * bTotal) / total : 0;

            const aAvgBuffer = a[`${gk}_avgBuffer`] ?? 0;
            const bAvgBuffer = b[`${gk}_avgBuffer`] ?? 0;
            merged[`${gk}_avgBuffer`] = total > 0 ? (aAvgBuffer * aTotal + bAvgBuffer * bTotal) / total : 0;

            for (const band of BANDS) {
                const key = band.key;
                merged[`${gk}_${key}`] = (a[`${gk}_${key}`] ?? 0) + (b[`${gk}_${key}`] ?? 0);
                merged[`${gk}_${key}_edge`] = (a[`${gk}_${key}_edge`] ?? 0) + (b[`${gk}_${key}_edge`] ?? 0);
            }
        }

        result.push(merged);
    }
    return result;
}

function SegmentedBar({ x = 0, y = 0, width = 0, height = 0, payload, groupKey }: SegmentedBarProps) {
    if (!payload || !width || !height || height <= 0) {
        return <g />;
    }
    const total = payload[`${groupKey}_total`] ?? 0;
    if (total <= 0) {
        return <g />;
    }

    const elements: React.ReactNode[] = [];
    let offsetFromBottom = 0;

    for (let bi = 0; bi < BANDS.length; bi++) {
        const b = BANDS[bi];
        const value = payload[`${groupKey}_${b.key}`] ?? 0;
        if (value <= 0) {
            continue;
        }
        const h = height * (value / total);
        const ry = y + height - offsetFromBottom - h;
        const isTop =
            bi === BANDS.length - 1 || BANDS.slice(bi + 1).every((nb) => (payload[`${groupKey}_${nb.key}`] ?? 0) <= 0);
        elements.push(
            <g key={b.key}>
                <rect x={x} y={ry} width={width} height={h} fill={b.color} fillOpacity={0.88} />
                {isTop && <line x1={x} x2={x + width} y1={ry} y2={ry} stroke='rgba(0,0,0,0.35)' strokeWidth={1.5} />}
            </g>,
        );
        offsetFromBottom += h;
    }

    return <g>{elements}</g>;
}

function makeTooltip(
    groupKeys: readonly string[],
    groupLabels: Record<string, string>,
    groupColors: Record<string, string>,
) {
    return function TooltipContent({
        active,
        payload,
        label,
    }: {
        active?: boolean;
        payload?: { payload: ChartRow }[];
        label?: number;
    }) {
        if (!active || !payload || payload.length === 0) {
            return null;
        }
        const row = payload[0].payload;
        const totalPop = groupKeys.reduce((s, k) => s + (row[`${k}_total`] ?? 0), 0);
        return (
            <div className='rounded-lg border bg-card p-2 text-xs shadow-md min-w-[210px]'>
                <div className='font-medium mb-1'>
                    Age {label} · {formatNumberWithUnit(totalPop, 'persons')}
                </div>
                {groupKeys.map((gk) => {
                    const pop = row[`${gk}_total`] ?? 0;
                    if (pop === 0) {
                        return null;
                    }
                    const avgStarvation = row[`${gk}_avgStarvation`] ?? 0;
                    const avgBuffer = row[`${gk}_avgBuffer`] ?? 0;
                    return (
                        <div key={gk} className='mt-1'>
                            <div className='flex items-center gap-1 font-medium' style={{ color: groupColors[gk] }}>
                                <span
                                    className='inline-block w-2 h-2 rounded-sm flex-shrink-0'
                                    style={{ background: groupColors[gk] }}
                                />
                                {groupLabels[gk]} · {formatNumberWithUnit(pop, 'persons')}
                            </div>
                            <div className='pl-3 text-muted-foreground'>
                                starvation {formatPct(avgStarvation)} · buffer {formatPct(avgBuffer)}
                            </div>
                            <div className='pl-3 flex flex-wrap gap-x-1'>
                                {BANDS.map((b) => {
                                    const cnt = (row[`${gk}_${b.key}`] ?? 0) + (row[`${gk}_${b.key}_edge`] ?? 0);
                                    if (cnt <= 0) {
                                        return null;
                                    }
                                    return (
                                        <span key={b.key} style={{ color: b.color }}>
                                            {b.label.split(' ')[0]} {formatNumberWithUnit(cnt, 'persons')}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };
}

export function BandLegend() {
    return (
        <div className='flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground mt-1'>
            {BANDS.slice()
                .reverse()
                .map((b) => (
                    <span key={b.key} className='flex items-center gap-0.5'>
                        <span className='inline-block w-2.5 h-2.5 rounded-sm' style={{ backgroundColor: b.color }} />
                        {b.label}
                    </span>
                ))}
        </div>
    );
}

type Props = {
    rows: AggRow[];
    groupMode: GroupMode;
    serviceKey?: ServiceName;
};

function EmptyChart({ height = 200 }: { height?: number }) {
    return (
        <div
            className='w-full rounded border border-dashed border-muted flex items-center justify-center text-xs text-muted-foreground'
            style={{ height }}
        >
            No data
        </div>
    );
}

export default function NutritionHeatmapChart({ rows, groupMode, serviceKey = 'grocery' }: Props): React.ReactElement {
    const isVerySmall = useIsSmallScreen();

    const groupKeys: readonly string[] = groupMode === 'occupation' ? OCCUPATIONS : educationLevelKeys;
    const groupLabels: Record<string, string> = groupMode === 'occupation' ? OCC_LABELS : EDU_LABELS;
    const groupColors: Record<string, string> = groupMode === 'occupation' ? OCC_COLORS : EDU_COLORS;
    const targetPerPerson =
        SERVICE_DEFINITIONS[serviceKey].bufferTargetTicks *
        SERVICE_DEFINITIONS[serviceKey].consumptionRatePerPersonPerTick;

    const { data, yDomain } = useMemo(() => {
        const builtData: ChartRow[] = [];

        for (const r of rows) {
            const row: ChartRow = { age: r.age };
            let ageTotalPop = 0;

            for (let gi = 0; gi < groupKeys.length; gi++) {
                const gk = groupKeys[gi];
                const gv = r.groupValues[gi];
                const gPop = gv[GV_POP];

                let totalBuffer: number;
                let weightedStarv: number;
                if (serviceKey === 'grocery') {
                    totalBuffer = gv[GV_FOOD];
                    weightedStarv = gv[GV_STARV];
                } else {
                    const svcEntry = r.serviceBuffers[serviceKey as Exclude<ServiceName, 'grocery'>][gi];
                    totalBuffer = svcEntry[0];
                    weightedStarv = svcEntry[1];
                }

                const avgStarvation = gPop > 0 && weightedStarv > 0 ? weightedStarv / gPop : 0;
                const avgStock = gPop > 0 ? totalBuffer / gPop : 0;
                const avgBuffer = targetPerPerson > 0 ? avgStock / targetPerPerson : 0;

                const bandIdx = classifyBand(avgStarvation);
                for (let bi = 0; bi < BANDS.length; bi++) {
                    row[`${gk}_${BANDS[bi].key}`] = bi === bandIdx ? gPop : 0;
                }

                row[`${gk}_total`] = gPop;
                row[`${gk}_avgStarvation`] = avgStarvation;
                row[`${gk}_avgBuffer`] = avgBuffer;
                ageTotalPop += gPop;
            }

            if (ageTotalPop === 0) {
                continue;
            }
            builtData.push(row);
        }

        const finalData = isVerySmall ? mergePairs(builtData, groupKeys) : builtData;

        let maxY = 0;
        let tp = 0;
        let ts = 0;
        let wStarv = 0;
        let wBuffer = 0;

        for (const row of finalData) {
            let rowTotal = 0;
            for (const gk of groupKeys) {
                const pop = row[`${gk}_total`] ?? 0;
                tp += pop;
                rowTotal += pop;
                wStarv += pop * (row[`${gk}_avgStarvation`] ?? 0);
                wBuffer += pop * (row[`${gk}_avgBuffer`] ?? 0);

                for (let bi = 0; bi <= 4; bi++) {
                    ts += row[`${gk}_${BANDS[bi].key}`] ?? 0;
                }
            }
            if (rowTotal > maxY) {
                maxY = rowTotal;
            }
        }

        return {
            data: finalData,
            totalPop: tp,
            totalStarving: ts,
            globalAvgStarvation: tp > 0 ? wStarv / tp : 0,
            globalAvgBuffer: tp > 0 ? wBuffer / tp : 0,
            yDomain: [0, maxY > 0 ? maxY : 1] as [number, number],
        };
    }, [rows, groupKeys, serviceKey, targetPerPerson, isVerySmall]);

    const tooltip = useMemo(
        () => makeTooltip(groupKeys, groupLabels, groupColors),
        [groupKeys, groupLabels, groupColors],
    );

    if (data.length === 0) {
        return <EmptyChart />;
    }

    return (
        <>
            <ResponsiveContainer width='100%' minHeight={200} minWidth={290}>
                <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap='5%'>
                    <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                    <YAxis
                        width={40}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => formatNumberWithUnit(v as number, 'persons')}
                        domain={yDomain}
                    />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {isVerySmall ? null : <Tooltip content={tooltip as any} />}

                    {groupKeys.map((gk) => (
                        <Bar
                            key={gk}
                            dataKey={`${gk}_total`}
                            stackId='nutrition'
                            legendType='none'
                            isAnimationActive={false}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            shape={(props: any) => <SegmentedBar {...props} groupKey={gk} />}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
            <BandLegend />
        </>
    );
}
