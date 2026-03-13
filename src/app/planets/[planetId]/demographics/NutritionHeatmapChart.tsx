'use client';

import React, { useRef } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

import { educationLevelKeys } from '@/simulation/population/education';
import { OCCUPATIONS } from '@/simulation/population/population';
import { EDU_COLORS, EDU_LABELS, OCC_COLORS, OCC_LABELS } from '../../components/CohortFilter';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { formatNumbers } from '@/lib/utils';
import type { AggRow, GroupMode } from './demographicsTypes';
import { FOOD_TARGET_PER_PERSON, GV_FOOD, GV_POP, GV_STARV } from './demographicsTypes';

// ─── Nutrition bands ──────────────────────────────────────────────────────────

const BANDS = [
    { key: 'fatalStarvation', label: 'Fatal', color: '#7f1d1d' }, // darkest red
    { key: 'severeStarvation', label: 'Severe', color: '#b91c1c' }, // strong red
    { key: 'seriousStarvation', label: 'Serious', color: '#ea580c' }, // orange
    { key: 'moderateStarvation', label: 'Moderate', color: '#f59e0b' }, // amber
    { key: 'lightStarvation', label: 'Light', color: '#eab308' }, // yellow
    { key: 'noStarvation', label: 'None', color: '#16a34a' }, // green
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

const formatPct = (n: number): string => `${(n * 100).toFixed(1)}%`;

// ─── Types ────────────────────────────────────────────────────────────────────

type ChartRow = Record<string, number>;

// ─── TopEdgeRect — draws a segment with a dividing line at the top ─────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TopEdgeRect(props: any) {
    const { x, y, width, height, fill, fillOpacity } = props;
    if (!width || !height || height <= 0) {
        return <g />;
    }
    return (
        <g>
            <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={fillOpacity} />
            <line x1={x} x2={x + width} y1={y} y2={y} stroke='rgba(0,0,0,0.35)' strokeWidth={1.5} />
        </g>
    );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

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
                    Age {label} · {formatNumbers(totalPop)}
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
                                {groupLabels[gk]} · {formatNumbers(pop)}
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
                                            {b.label.split(' ')[0]} {formatNumbers(cnt)}
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

// ─── Legends ─────────────────────────────────────────────────────────────────

function BandLegend() {
    return (
        <div className='flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground mt-1'>
            {BANDS.map((b) => (
                <span key={b.key} className='flex items-center gap-0.5'>
                    <span className='inline-block w-2.5 h-2.5 rounded-sm' style={{ backgroundColor: b.color }} />
                    {b.label}
                </span>
            ))}
        </div>
    );
}

function GroupLegend({
    keys,
    labels,
    colors,
}: {
    keys: readonly string[];
    labels: Record<string, string>;
    colors: Record<string, string>;
}) {
    return (
        <div className='flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] mt-0.5'>
            {keys.map((k) => (
                <span key={k} className='flex items-center gap-1'>
                    <span
                        className='inline-block w-2.5 h-2.5 rounded-sm border'
                        style={{ borderColor: colors[k], background: 'transparent' }}
                    />
                    {labels[k]}
                </span>
            ))}
        </div>
    );
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
    rows: AggRow[];
    groupMode: GroupMode;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function NutritionHeatmapChart({ rows, groupMode }: Props): React.ReactElement {
    const lastYDomainRef = useRef<[number, number]>([0, 1]);
    const isVerySmall = useIsSmallScreen();

    const groupKeys: readonly string[] = groupMode === 'occupation' ? OCCUPATIONS : educationLevelKeys;
    const groupLabels: Record<string, string> = groupMode === 'occupation' ? OCC_LABELS : EDU_LABELS;
    const groupColors: Record<string, string> = groupMode === 'occupation' ? OCC_COLORS : EDU_COLORS;

    // ── Build chart data ──────────────────────────────────────────────────────
    // For each age row we produce per group key:
    //   ${gk}_${bandKey}       — band population (plain stacked bar)
    //   ${gk}_${bandKey}_edge  — same for topmost band (rendered via TopEdgeRect)
    //   ${gk}_total            — for tooltip
    //   ${gk}_avgStarvation    — for tooltip
    //   ${gk}_avgBuffer        — for tooltip
    const data: ChartRow[] = [];

    for (const r of rows) {
        const row: ChartRow = { age: r.age };
        let ageTotalPop = 0;

        for (let gi = 0; gi < groupKeys.length; gi++) {
            const gk = groupKeys[gi];
            const gv = r.groupValues[gi];
            const gPop = gv[GV_POP];
            const totalFood = gv[GV_FOOD];
            const weightedStarv = gv[GV_STARV];

            const avgStarvation = gPop > 0 ? weightedStarv / gPop : 0;
            const avgStock = gPop > 0 ? totalFood / gPop : 0;
            const avgBuffer = FOOD_TARGET_PER_PERSON > 0 ? avgStock / FOOD_TARGET_PER_PERSON : 0;

            // We don't have per-cell data anymore — classify the whole group by its avg starvation
            // and assign all population to that single band.
            const bandIdx = classifyBand(avgStarvation);
            const bandPops: number[] = new Array(BANDS.length).fill(0);
            bandPops[bandIdx] = gPop;

            row[`${gk}_total`] = gPop;
            row[`${gk}_avgStarvation`] = avgStarvation;
            row[`${gk}_avgBuffer`] = avgBuffer;
            ageTotalPop += gPop;

            // Topmost non-zero band gets the TopEdgeRect treatment
            let lastNonZeroIdx = -1;
            for (let bi = BANDS.length - 1; bi >= 0; bi--) {
                if (bandPops[bi] > 0) {
                    lastNonZeroIdx = bi;
                    break;
                }
            }

            for (let bi = 0; bi < BANDS.length; bi++) {
                const bk = BANDS[bi].key;
                if (bi === lastNonZeroIdx) {
                    row[`${gk}_${bk}`] = 0;
                    row[`${gk}_${bk}_edge`] = bandPops[bi];
                } else {
                    row[`${gk}_${bk}`] = bandPops[bi];
                    row[`${gk}_${bk}_edge`] = 0;
                }
            }
        }

        if (ageTotalPop === 0) {
            continue;
        }
        data.push(row);
    }

    if (data.length === 0) {
        return <div className='text-xs text-muted-foreground'>No nutrition data available</div>;
    }

    // Y-axis domain
    let maxY = 0;
    for (const row of data) {
        let rowTotal = 0;
        for (const gk of groupKeys) {
            rowTotal += row[`${gk}_total`] ?? 0;
        }
        if (rowTotal > maxY) {
            maxY = rowTotal;
        }
    }
    if (maxY > 0) {
        lastYDomainRef.current = [0, maxY];
    }
    const yDomain = lastYDomainRef.current;

    // Summary stats (global)
    let totalPop = 0;
    let totalStarving = 0;
    let weightedStarvation = 0;
    let weightedBuffer = 0;
    for (const row of data) {
        for (const gk of groupKeys) {
            const pop = row[`${gk}_total`] ?? 0;
            totalPop += pop;
            weightedStarvation += pop * (row[`${gk}_avgStarvation`] ?? 0);
            weightedBuffer += pop * (row[`${gk}_avgBuffer`] ?? 0);
            totalStarving +=
                (row[`${gk}_severeStarvation`] ?? 0) +
                (row[`${gk}_severeStarvation_edge`] ?? 0) +
                (row[`${gk}_moderateStarvation`] ?? 0) +
                (row[`${gk}_moderateStarvation_edge`] ?? 0) +
                (row[`${gk}_lightStarvation`] ?? 0) +
                (row[`${gk}_lightStarvation_edge`] ?? 0);
        }
    }
    const globalAvgStarvation = totalPop > 0 ? weightedStarvation / totalPop : 0;
    const globalAvgBuffer = totalPop > 0 ? weightedBuffer / totalPop : 0;

    const tooltip = makeTooltip(groupKeys, groupLabels, groupColors);

    return (
        <>
            {/* Summary stats */}
            <div className='flex gap-3 text-[10px] text-muted-foreground mb-2 flex-wrap'>
                <span>
                    Starving:{' '}
                    <span
                        className={
                            totalStarving / totalPop > 0.05
                                ? 'text-red-500 font-semibold'
                                : totalStarving > 0
                                  ? 'text-amber-500'
                                  : 'text-green-600'
                        }
                    >
                        {formatNumbers(totalStarving)} ({formatPct(totalPop > 0 ? totalStarving / totalPop : 0)})
                    </span>
                </span>
                <span>
                    Avg starvation:{' '}
                    <span
                        className={
                            globalAvgStarvation > 0.3
                                ? 'text-red-500 font-semibold'
                                : globalAvgStarvation > 0
                                  ? 'text-amber-500'
                                  : 'text-green-600'
                        }
                    >
                        {formatPct(globalAvgStarvation)}
                    </span>
                </span>
                <span>
                    Avg buffer:{' '}
                    <span
                        className={
                            globalAvgBuffer < 0.3
                                ? 'text-red-500'
                                : globalAvgBuffer < 0.7
                                  ? 'text-amber-500'
                                  : 'text-green-600'
                        }
                    >
                        {formatPct(globalAvgBuffer)}
                    </span>
                </span>
            </div>

            <ResponsiveContainer width='100%' minHeight={200} minWidth={290}>
                <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap='5%'>
                    <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                    <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                    <YAxis width={40} tick={{ fontSize: 10 }} tickFormatter={formatNumbers} domain={yDomain} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {isVerySmall ? null : <Tooltip content={tooltip as any} />}

                    {groupKeys.flatMap((gk) =>
                        BANDS.flatMap((b) => [
                            <Bar
                                key={`${gk}_${b.key}`}
                                dataKey={`${gk}_${b.key}`}
                                stackId='nutrition'
                                fill={b.color}
                                fillOpacity={0.88}
                                name={b.label}
                                legendType='none'
                                isAnimationActive={false}
                            />,
                            <Bar
                                key={`${gk}_${b.key}_edge`}
                                dataKey={`${gk}_${b.key}_edge`}
                                stackId='nutrition'
                                fill={b.color}
                                fillOpacity={0.88}
                                name={`${b.label} (top)`}
                                legendType='none'
                                isAnimationActive={false}
                            />,
                        ]),
                    )}
                </BarChart>
            </ResponsiveContainer>

            <BandLegend />
            <GroupLegend keys={groupKeys} labels={groupLabels} colors={groupColors} />
        </>
    );
}
