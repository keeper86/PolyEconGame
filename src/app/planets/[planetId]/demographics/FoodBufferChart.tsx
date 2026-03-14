'use client';

import { useIsSmallScreen } from '@/hooks/useMobile';
import { formatNumbers } from '@/lib/utils';
import { educationLevelKeys } from '@/simulation/population/education';
import { OCCUPATIONS } from '@/simulation/population/population';
import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EDU_COLORS, EDU_LABELS, OCC_COLORS, OCC_LABELS } from '../../components/CohortFilter';
import type { AggRow, GroupMode } from './demographicsTypes';
import { FOOD_TARGET_PER_PERSON, GV_FOOD, GV_POP } from './demographicsTypes';

// ─── Types ────────────────────────────────────────────────────────────────────

type ChartRow = Record<string, number>;

// ─── FoodBufferBar — filled portion + faded empty portion in one shape ────────

interface FoodBufferBarProps {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    payload?: ChartRow;
    groupKey: string;
    color: string;
}

function FoodBufferBar({ x = 0, y = 0, width = 0, height = 0, payload, groupKey, color }: FoodBufferBarProps) {
    if (!payload || !width || !height || height <= 0) {
        return <g />;
    }
    const clampedRatio = Math.min(1, Math.max(0, payload[`${groupKey}_bufferRatio`] ?? 0));
    const filledH = height * clampedRatio;
    const emptyH = height - filledH;
    return (
        <g>
            {emptyH > 0 && (
                <>
                    <rect x={x} y={y} width={width} height={emptyH} fill={color} fillOpacity={0.2} />
                    {clampedRatio < 0.95 && <line x1={x} x2={x + width} y1={y} y2={y} stroke='#000' strokeWidth={1} />}
                </>
            )}
            {filledH > 0 && <rect x={x} y={y + emptyH} width={width} height={filledH} fill={color} fillOpacity={0.9} />}
        </g>
    );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function makeTooltip(keys: readonly string[], labels: Record<string, string>, colors: Record<string, string>) {
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
        return (
            <div className='rounded-lg border bg-card p-2 text-xs shadow-md min-w-[160px]'>
                <div className='font-medium mb-1'>Age {label}</div>
                {keys.map((key) => {
                    const pop = row[`${key}_pop`] ?? 0;
                    if (pop === 0) {
                        return null;
                    }
                    const ratio = row[`${key}_bufferRatio`] ?? 0;
                    const avgStock = row[`${key}_avgStock`] ?? 0;
                    return (
                        <div key={key} className='flex items-center gap-1 mt-0.5'>
                            <span
                                className='inline-block w-2 h-2 rounded-sm flex-shrink-0'
                                style={{ background: colors[key] }}
                            />
                            <span style={{ color: colors[key] }} className='font-medium'>
                                {labels[key]}
                            </span>
                            <span className='ml-auto pl-2 text-muted-foreground'>
                                {(ratio * 100).toFixed(0)}% · {formatNumbers(avgStock * 1000)} kg · {formatNumbers(pop)}
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    };
}

// ─── mergePairs ───────────────────────────────────────────────────────────────

function mergePairs(rows: ChartRow[], rowKeys: readonly string[]): ChartRow[] {
    const result: ChartRow[] = [];
    for (let i = 0; i < rows.length; i += 2) {
        const a = rows[i];
        const b = rows[i + 1];
        if (!b) {
            result.push(a);
            continue;
        }
        const merged: ChartRow = { age: a.age };
        for (const key of rowKeys) {
            const aPop = a[`${key}_pop`] ?? 0;
            const bPop = b[`${key}_pop`] ?? 0;
            const totalPop = aPop + bPop;
            const aAvgStock = a[`${key}_avgStock`] ?? 0;
            const bAvgStock = b[`${key}_avgStock`] ?? 0;
            const avgStock = totalPop > 0 ? (aAvgStock * aPop + bAvgStock * bPop) / totalPop : 0;
            const ratio = avgStock / FOOD_TARGET_PER_PERSON;
            merged[`${key}_pop`] = totalPop;
            merged[`${key}_avgStock`] = avgStock;
            merged[`${key}_bufferRatio`] = ratio;
        }
        result.push(merged);
    }
    return result;
}

// ─── ColorLegend ─────────────────────────────────────────────────────────────

function ColorLegend({
    keys,
    labels,
    colors,
}: {
    keys: readonly string[];
    labels: Record<string, string>;
    colors: Record<string, string>;
}) {
    return (
        <div className='flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] mb-1'>
            {keys.map((key) => (
                <span key={key} className='flex items-center gap-1'>
                    <span className='inline-block w-2.5 h-2.5 rounded-sm' style={{ background: colors[key] }} />
                    {labels[key]}
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

function EmptyChart({ height = 180 }: { height?: number }) {
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

export default function FoodBufferChart({ rows, groupMode }: Props): React.ReactElement {
    const isVerySmall = useIsSmallScreen();

    const keys: readonly string[] = groupMode === 'occupation' ? OCCUPATIONS : educationLevelKeys;
    const labels: Record<string, string> = groupMode === 'occupation' ? OCC_LABELS : EDU_LABELS;
    const colors: Record<string, string> = groupMode === 'occupation' ? OCC_COLORS : EDU_COLORS;

    const { data, yDomain } = useMemo(() => {
        const rawData: ChartRow[] = rows
            .map((r) => {
                const row: ChartRow = { age: r.age };
                let ageHasData = false;
                for (let gi = 0; gi < keys.length; gi++) {
                    const key = keys[gi];
                    const gv = r.groupValues[gi];
                    const pop = gv[GV_POP];
                    const totalFood = gv[GV_FOOD];
                    const avgStock = pop > 0 ? totalFood / pop : 0;
                    const ratio = avgStock / FOOD_TARGET_PER_PERSON;
                    row[`${key}_pop`] = pop;
                    row[`${key}_avgStock`] = avgStock;
                    row[`${key}_bufferRatio`] = ratio;
                    if (pop > 0) {
                        ageHasData = true;
                    }
                }
                return ageHasData ? row : null;
            })
            .filter((r): r is ChartRow => r !== null);

        const built = isVerySmall ? mergePairs(rawData, keys) : rawData;

        let maxY = 0;
        for (const row of built) {
            for (const key of keys) {
                const pop = row[`${key}_pop`] ?? 0;
                if (pop > maxY) {
                    maxY = pop;
                }
            }
        }

        return { data: built, yDomain: [0, maxY > 0 ? maxY : 1] as [number, number] };
    }, [rows, keys, isVerySmall]);

    const tooltip = useMemo(() => makeTooltip(keys, labels, colors), [keys, labels, colors]);

    if (data.length === 0) {
        return <EmptyChart />;
    }

    return (
        <>
            <ResponsiveContainer width='100%' minHeight={180} minWidth={290}>
                <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap='5%'>
                    <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                    <XAxis dataKey='age' tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <YAxis width={40} tick={{ fontSize: 10 }} tickFormatter={formatNumbers} domain={yDomain} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {isVerySmall ? null : <Tooltip content={tooltip as any} />}
                    {keys.map((key) => (
                        <Bar
                            key={key}
                            dataKey={`${key}_pop`}
                            stackId='a'
                            name={labels[key]}
                            isAnimationActive={false}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            shape={(props: any) => <FoodBufferBar {...props} groupKey={key} color={colors[key]} />}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </>
    );
}
