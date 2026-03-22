'use client';

import React, { useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Card, CardContent } from '@/components/ui/card';
import { EDU_COLORS, EDU_LABELS, OCC_COLORS, OCC_LABELS } from '@/app/planets/_components/CohortFilter';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { formatNumbers } from '@/lib/utils';
import { educationLevelKeys } from '@/simulation/population/education';
import { OCCUPATIONS } from '@/simulation/population/population';
import type { AggRow, GroupMode } from './demographicsTypes';
import { GV_POP, GV_WEALTH } from './demographicsTypes';

// ─── Types ───────────────────────────────────────────────────────────────────

type ChartRow = Record<string, number>;

// ─── Tooltip factory ─────────────────────────────────────────────────────────

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
            <div className='rounded-lg border bg-card p-2 text-xs shadow-md min-w-[180px]'>
                <div className='font-medium mb-1'>Age {label}</div>
                {keys.map((key) => {
                    const pop = row[`${key}_pop`] ?? 0;
                    if (pop === 0) {
                        return null;
                    }
                    const mean = row[`${key}_mean`] ?? 0;
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
                                {formatNumbers(mean)} · {formatNumbers(pop)}
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    };
}

// ─── mergePairs (condense adjacent age rows on very small screens) ─────────────

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
            const aMean = a[`${key}_mean`] ?? 0;
            const bMean = b[`${key}_mean`] ?? 0;
            const mean = totalPop > 0 ? (aMean * aPop + bMean * bPop) / totalPop : 0;
            merged[`${key}_pop`] = totalPop;
            merged[`${key}_mean`] = mean;
            merged[`${key}_bar`] = totalPop > 0 ? mean : 0;
        }
        result.push(merged);
    }
    return result;
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WealthDistributionChart({ rows, groupMode }: Props): React.ReactElement {
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
                    const weightedWealth = gv[GV_WEALTH];
                    const mean = pop > 0 ? weightedWealth : 0;
                    row[`${key}_pop`] = pop;
                    row[`${key}_mean`] = mean;
                    row[`${key}_bar`] = pop > 0 ? mean : 0;
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
                const v = row[`${key}_bar`] ?? 0;
                if (v > maxY) {
                    maxY = v;
                }
            }
        }

        return {
            data: built,
            yDomain: [0, maxY > 0 ? maxY : 1] as [number, number],
        };
    }, [rows, keys, isVerySmall]);

    const tooltip = useMemo(() => makeTooltip(keys, labels, colors), [keys, labels, colors]);

    const hasData = data.some((row) => keys.some((k) => (row[`${k}_bar`] ?? 0) > 0));
    if (!hasData) {
        return <EmptyChart />;
    }

    return (
        <Card>
            <CardContent className='px-3 pt-3 pb-2'>
                <ResponsiveContainer width='100%' minHeight={180} minWidth={290}>
                    <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap='5%'>
                        <XAxis dataKey='age' tick={{ fontSize: 10 }} domain={[0, 100]} />
                        <YAxis
                            width={48}
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => formatNumbers(v)}
                            domain={yDomain}
                        />
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {isVerySmall ? null : <Tooltip content={tooltip as any} />}
                        {keys.map((key) => (
                            <Bar
                                key={key}
                                dataKey={`${key}_bar`}
                                stackId='a'
                                fill={colors[key]}
                                fillOpacity={0.85}
                                name={labels[key]}
                                isAnimationActive={false}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
