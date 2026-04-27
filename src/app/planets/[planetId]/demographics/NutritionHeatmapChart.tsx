'use client';

import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

import { educationLevelKeys } from '@/simulation/population/education';
import { OCCUPATIONS } from '@/simulation/population/population';
import { EDU_COLORS, EDU_LABELS, OCC_COLORS, OCC_LABELS } from '../../_components/CohortFilter';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { formatNumberWithUnit } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import type { AggRow, GroupMode } from './demographicsTypes';
import { SERVICE_TARGET_PER_PERSON, GV_FOOD, GV_POP, GV_STARV } from './demographicsTypes';

// ─── Nutrition bands ──────────────────────────────────────────────────────────

const BANDS = [
    { key: 'fatalStarvation', label: 'Fatal', color: '#7f1d1d' }, // darkest red
    { key: 'severeStarvation', label: 'Severe', color: '#b91c1c' }, // strong red
    { key: 'seriousStarvation', label: 'Serious', color: '#ea580c' }, // orange
    { key: 'moderateStarvation', label: 'Moderate', color: '#f59e0b' }, // amber
    { key: 'lightStarvation', label: 'Light', color: '#d9e70eff' }, // yellow
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

// ─── SegmentedBar — renders band segments inside a single Recharts Bar ────────

interface SegmentedBarProps {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    payload?: ChartRow;
    groupKey: string;
}

// ─── mergePairs ─────────────────────────────────────────────────────────────

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

            // Sum band counts and any _edge counts if present
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

// ─── Legends ─────────────────────────────────────────────────────────────────

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

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
    rows: AggRow[];
    groupMode: GroupMode;
};

// ─── Empty placeholder ────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function NutritionHeatmapChart({ rows, groupMode }: Props): React.ReactElement {
    const isVerySmall = useIsSmallScreen();

    const groupKeys: readonly string[] = groupMode === 'occupation' ? OCCUPATIONS : educationLevelKeys;
    const groupLabels: Record<string, string> = groupMode === 'occupation' ? OCC_LABELS : EDU_LABELS;
    const groupColors: Record<string, string> = groupMode === 'occupation' ? OCC_COLORS : EDU_COLORS;

    // ── Build chart data ──────────────────────────────────────────────────────
    // For each age row we produce per group key:
    //   ${gk}_${bandKey}    — band population
    //   ${gk}_total         — total pop (used as dataKey for the Bar + tooltip)
    //   ${gk}_avgStarvation — for tooltip
    //   ${gk}_avgBuffer     — for tooltip
    const { data, totalPop, totalStarving, globalAvgStarvation, globalAvgBuffer, yDomain } = useMemo(() => {
        const builtData: ChartRow[] = [];

        for (const r of rows) {
            const row: ChartRow = { age: r.age };
            let ageTotalPop = 0;

            for (let gi = 0; gi < groupKeys.length; gi++) {
                const gk = groupKeys[gi];
                const gv = r.groupValues[gi];
                const gPop = gv[GV_POP];
                const totalFood = gv[GV_FOOD];
                const weightedStarv = gv[GV_STARV];

                const avgStarvation = gPop > 0 && weightedStarv > 0 ? weightedStarv / gPop : 0;
                const avgStock = gPop > 0 ? totalFood / gPop : 0;
                const avgBuffer = SERVICE_TARGET_PER_PERSON > 0 ? avgStock / SERVICE_TARGET_PER_PERSON : 0;

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

        // Down-sample by merging adjacent age rows when on very small screens
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
                // Starving = bands 0–4 (fatal, severe, serious, moderate, light)
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
    }, [rows, groupKeys, isVerySmall]);

    const tooltip = useMemo(
        () => makeTooltip(groupKeys, groupLabels, groupColors),
        [groupKeys, groupLabels, groupColors],
    );

    if (data.length === 0) {
        return <EmptyChart />;
    }

    const starvingPct = totalPop > 0 ? totalStarving / totalPop : 0;

    // Decide colors similar to the inline classes previously used
    const starvingColor = starvingPct > 0.05 ? '#ef4444' : totalStarving > 0 ? '#f59e0b' : '#16a34a';
    const avgStarvColor = globalAvgStarvation > 0.3 ? '#ef4444' : globalAvgStarvation > 0 ? '#f59e0b' : '#16a34a';
    const avgBufferColor = globalAvgBuffer < 0.3 ? '#ef4444' : globalAvgBuffer < 0.7 ? '#f59e0b' : '#16a34a';

    const summaryCards = isVerySmall ? (
        <div className='flex gap-1 mb-2'>
            <div
                className='flex-1 px-1.5 py-1 border rounded text-xs'
                style={{ borderLeftColor: starvingColor, borderLeftWidth: 3 }}
            >
                <div className='text-muted-foreground text-[9px] leading-tight truncate'>Starving</div>
                <div className='font-semibold text-[11px] leading-tight'>
                    {formatNumberWithUnit(totalStarving, 'persons')}
                </div>
                <div className='text-[9px] text-muted-foreground leading-tight'>{formatPct(starvingPct)}</div>
            </div>

            <div
                className='flex-1 px-1.5 py-1 border rounded text-xs'
                style={{ borderLeftColor: avgStarvColor, borderLeftWidth: 3 }}
            >
                <div className='text-muted-foreground text-[9px] leading-tight truncate'>Avg starvation</div>
                <div className='font-semibold text-[11px] leading-tight'>{formatPct(globalAvgStarvation)}</div>
                <div className='text-[9px] text-muted-foreground leading-tight'>Weighted</div>
            </div>

            <div
                className='flex-1 px-1.5 py-1 border rounded text-xs'
                style={{ borderLeftColor: avgBufferColor, borderLeftWidth: 3 }}
            >
                <div className='text-muted-foreground text-[9px] leading-tight truncate'>Avg buffer</div>
                <div className='font-semibold text-[11px] leading-tight'>{formatPct(globalAvgBuffer)}</div>
                <div className='text-[9px] text-muted-foreground leading-tight'>Target normalized</div>
            </div>
        </div>
    ) : (
        <div className='flex gap-2 mb-3'>
            <Card className='flex-1 overflow-hidden' style={{ borderLeftColor: starvingColor, borderLeftWidth: 3 }}>
                <CardContent className='px-3 py-2.5 space-y-0.5'>
                    <p className='text-[11px] text-muted-foreground font-medium'>Starving</p>
                    <p className='text-lg font-semibold leading-tight'>
                        {formatNumberWithUnit(totalStarving, 'persons')}
                    </p>
                    <p className='text-xs text-muted-foreground'>{formatPct(starvingPct)}</p>
                </CardContent>
            </Card>

            <Card className='flex-1 overflow-hidden' style={{ borderLeftColor: avgStarvColor, borderLeftWidth: 3 }}>
                <CardContent className='px-3 py-2.5 space-y-0.5'>
                    <p className='text-[11px] text-muted-foreground font-medium'>Avg starvation</p>
                    <p className='text-lg font-semibold leading-tight'>{formatPct(globalAvgStarvation)}</p>
                    <p className='text-xs text-muted-foreground'>Weighted by population</p>
                </CardContent>
            </Card>

            <Card className='flex-1 overflow-hidden' style={{ borderLeftColor: avgBufferColor, borderLeftWidth: 3 }}>
                <CardContent className='px-3 py-2.5 space-y-0.5'>
                    <p className='text-[11px] text-muted-foreground font-medium'>Avg buffer</p>
                    <p className='text-lg font-semibold leading-tight'>{formatPct(globalAvgBuffer)}</p>
                    <p className='text-xs text-muted-foreground'>Normalized to food target</p>
                </CardContent>
            </Card>
        </div>
    );

    return (
        <>
            <span className='mb-2 flex justify-between items-center'>
                <h4 className='text-sm font-semibold mb-2' id='food'>
                    Starvation heatmap
                </h4>
                <BandLegend />
            </span>

            <Card>
                <CardContent className='px-3 pt-3 pb-2'>
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
                </CardContent>
            </Card>

            {summaryCards}
        </>
    );
}
