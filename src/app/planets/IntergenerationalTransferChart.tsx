'use client';

import React, { useState, useMemo } from 'react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine,
} from 'recharts';
import type { Population, FoodMarket, TransferMatrix } from '@/simulation/planet';
import { educationLevelKeys, OCCUPATIONS } from '@/simulation/planet';
import { CHILD_MAX_AGE, ELDERLY_MIN_AGE } from '@/simulation/constants';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EDU_COLORS, EDU_LABELS, OCC_COLORS, OCC_LABELS } from './CohortFilter';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n: number): string => {
    if (Math.abs(n) >= 1_000_000) {
        return `${(n / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(n) >= 1_000) {
        return `${(n / 1_000).toFixed(1)}k`;
    }
    return n.toFixed(1);
};

/* ------------------------------------------------------------------ */
/*  View modes                                                         */
/* ------------------------------------------------------------------ */

type ViewMode = 'occupation' | 'education';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type Props = {
    population: Population;
    foodMarket?: FoodMarket;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * IntergenerationalTransferChart — stacked diverging bar chart showing
 * which age cohorts are net givers vs. net receivers of wealth,
 * broken down by occupation or education level.
 *
 * Reads the full-resolution transfer matrix from
 * `foodMarket.lastTransferMatrix` (age × edu × occ) written by the
 * backend each tick.  No client-side simulation or reconstruction needed.
 *
 * View modes:
 * - **occupation**: bars stacked by occupation (summed over education)
 * - **education**: bars stacked by education level (summed over occupation)
 */
export default function IntergenerationalTransferChart({ foodMarket }: Props): React.ReactElement {
    const [viewMode, setViewMode] = useState<ViewMode>('occupation');

    const matrix: TransferMatrix | undefined = foodMarket?.lastTransferMatrix;

    const { occData, eduData, totalReceived, totalGiven } = useMemo(() => {
        if (!matrix || matrix.length === 0) {
            return { occData: [], eduData: [], totalReceived: 0, totalGiven: 0 };
        }

        const occRows: Record<string, number | string>[] = [];
        const eduRows: Record<string, number | string>[] = [];
        let received = 0;
        let given = 0;

        for (let age = 0; age < matrix.length; age++) {
            // Occupation view: row[occ] = Σ_edu transferMatrix[age][edu][occ]
            const occRow: Record<string, number | string> = { age };
            let ageTotal = 0;
            for (const occ of OCCUPATIONS) {
                let sum = 0;
                for (const edu of educationLevelKeys) {
                    sum += matrix[age][edu][occ];
                }
                occRow[OCC_LABELS[occ]] = sum;
                ageTotal += sum;
            }
            occRow._total = ageTotal;
            occRows.push(occRow);

            // Education view: row[edu] = Σ_occ transferMatrix[age][edu][occ]
            const eduRow: Record<string, number | string> = { age };
            let eduAgeTotal = 0;
            for (const edu of educationLevelKeys) {
                let sum = 0;
                for (const occ of OCCUPATIONS) {
                    sum += matrix[age][edu][occ];
                }
                eduRow[EDU_LABELS[edu]] = sum;
                eduAgeTotal += sum;
            }
            eduRow._total = eduAgeTotal;
            eduRows.push(eduRow);

            // Summary stats
            if (ageTotal > 0) {
                received += ageTotal;
            } else {
                given += -ageTotal;
            }
        }

        return { occData: occRows, eduData: eduRows, totalReceived: received, totalGiven: given };
    }, [matrix]);

    if (!matrix || matrix.length === 0) {
        return <div className='text-xs text-muted-foreground'>No transfer data available</div>;
    }

    const hasData = totalReceived > 0 || totalGiven > 0;
    if (!hasData) {
        return <div className='text-xs text-muted-foreground'>No intergenerational transfers active</div>;
    }

    const chartData = viewMode === 'occupation' ? occData : eduData;

    return (
        <div>
            <div className='flex items-start justify-between gap-4 mb-2'>
                <div>
                    <h4 className='text-sm font-medium'>Intergenerational transfers</h4>
                    <div className='flex gap-3 text-[10px] text-muted-foreground mt-0.5'>
                        <span>
                            Received: <span className='text-blue-500 font-medium'>{fmt(totalReceived)}</span>
                        </span>
                        <span>
                            Given: <span className='text-green-600 font-medium'>{fmt(totalGiven)}</span>
                        </span>
                        <span className='text-muted-foreground/60'>(Δ = {fmt(totalReceived - totalGiven)})</span>
                    </div>
                </div>
                {/* Age boundary legend */}
                <div className='flex items-center gap-2 text-[10px] text-muted-foreground shrink-0 flex-wrap'>
                    <span>Children: 0–{CHILD_MAX_AGE}</span>
                    <span>Elderly: {ELDERLY_MIN_AGE}+</span>
                </div>
            </div>

            {/* View mode toggle */}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                <TabsList className='h-7 mb-2'>
                    <TabsTrigger value='occupation' className='text-[10px] px-2 py-0.5'>
                        By occupation
                    </TabsTrigger>
                    <TabsTrigger value='education' className='text-[10px] px-2 py-0.5'>
                        By education
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    <BarChart data={chartData} margin={{ top: 6, right: 12, left: 12, bottom: 6 }} stackOffset='sign'>
                        <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                        <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                        <YAxis
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => fmt(v)}
                            label={{
                                value: 'Net transfer (currency)',
                                angle: -90,
                                position: 'insideLeft',
                                style: { fontSize: 9 },
                            }}
                        />

                        <Tooltip
                            content={({ active, payload, label }) => {
                                if (!active || !payload || payload.length === 0) {
                                    return null;
                                }
                                const row = payload[0]?.payload as Record<string, number | string> | undefined;
                                if (!row) {
                                    return null;
                                }
                                const ageTotal = Number(row._total ?? 0);
                                return (
                                    <div className='rounded-lg border bg-card p-2 text-xs shadow-md min-w-[180px]'>
                                        <div className='font-medium mb-1'>Age {label}</div>
                                        {payload.map((entry) => {
                                            const val = Number(entry.value ?? 0);
                                            if (Math.abs(val) < 1e-6) {
                                                return null;
                                            }
                                            return (
                                                <div key={entry.dataKey as string} style={{ color: entry.color }}>
                                                    {entry.name}: {val > 0 ? '+' : ''}
                                                    {fmt(val)}
                                                </div>
                                            );
                                        })}
                                        <div className='mt-1 pt-1 border-t text-muted-foreground'>
                                            Total: {ageTotal > 0 ? '+' : ''}
                                            {fmt(ageTotal)}
                                        </div>
                                    </div>
                                );
                            }}
                        />
                        <Legend verticalAlign='top' height={20} wrapperStyle={{ fontSize: 10 }} />

                        {/* Zero reference line */}
                        <ReferenceLine y={0} stroke='#64748b' strokeWidth={1} />

                        {/* Stacked diverging bars */}
                        {viewMode === 'occupation'
                            ? OCCUPATIONS.map((occ) => (
                                  <Bar
                                      key={occ}
                                      dataKey={OCC_LABELS[occ]}
                                      stackId='a'
                                      fill={OCC_COLORS[occ]}
                                      isAnimationActive={false}
                                  />
                              ))
                            : educationLevelKeys.map((edu) => (
                                  <Bar
                                      key={edu}
                                      dataKey={EDU_LABELS[edu]}
                                      stackId='a'
                                      fill={EDU_COLORS[edu]}
                                      isAnimationActive={false}
                                  />
                              ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
