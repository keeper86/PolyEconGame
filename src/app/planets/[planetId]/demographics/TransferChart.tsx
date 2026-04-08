'use client';

import { useIsSmallScreen } from '@/hooks/useMobile';
import { formatNumbers } from '@/lib/utils';
import { educationLevelKeys } from '@/simulation/population/education';
import type { PopulationTransferMatrix } from '@/simulation/population/population';
import { OCCUPATIONS } from '@/simulation/population/population';
import React, { useEffect, useMemo, useRef } from 'react';
import { Bar, BarChart, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import ChartCard from '../../_components/ChartCard';
import { EDU_COLORS, EDU_LABELS, OCC_COLORS, OCC_LABELS } from '../../_components/CohortFilter';
import type { GroupMode } from './demographicsTypes';

type Props = {
    title: string;
    matrix: PopulationTransferMatrix | undefined;
    viewMode: GroupMode;
};

// Stable module-level key lists (used as merge keys)
const OCC_MERGE_KEYS = [...OCCUPATIONS.map((occ) => OCC_LABELS[occ]), '_total'];
const EDU_MERGE_KEYS = [...educationLevelKeys.map((edu) => EDU_LABELS[edu]), '_total'];

function mergePairs(rows: Record<string, number>[], keys: string[]): Record<string, number>[] {
    const result: Record<string, number>[] = [];
    for (let i = 0; i < rows.length; i += 2) {
        const a = rows[i];
        const b = rows[i + 1];
        if (!b) {
            result.push(a);
            continue;
        }
        const merged: Record<string, number> = { age: a.age };
        for (const key of keys) {
            merged[key] = (a[key] ?? 0) + (b[key] ?? 0);
        }
        result.push(merged);
    }
    return result;
}

export default function TransferChart({ title, matrix, viewMode }: Props): React.ReactElement {
    const isSmallScreen = useIsSmallScreen();

    const lastOccData = useRef<Record<string, number>[]>([]);
    const lastEduData = useRef<Record<string, number>[]>([]);
    const lastYDomain = useRef<[number, number]>([-1, 1]);

    const { occData, eduData, totalReceived, totalGiven } = useMemo(() => {
        if (!matrix || matrix.length === 0) {
            return { occData: lastOccData.current, eduData: lastEduData.current, totalReceived: 0, totalGiven: 0 };
        }

        const occRows: Record<string, number>[] = [];
        const eduRows: Record<string, number>[] = [];
        let received = 0;
        let given = 0;

        for (let age = 0; age < matrix.length; age++) {
            const cohort = matrix[age];

            const occRow: Record<string, number> = { age };
            let ageTotal = 0;
            for (const occ of OCCUPATIONS) {
                let sum = 0;
                for (const edu of educationLevelKeys) {
                    sum += cohort?.[edu]?.[occ] ?? 0;
                }
                occRow[OCC_LABELS[occ]] = sum;
                ageTotal += sum;
            }
            occRow._total = ageTotal;
            occRows.push(occRow);

            const eduRow: Record<string, number> = { age };
            let eduAgeTotal = 0;
            for (const edu of educationLevelKeys) {
                let sum = 0;
                for (const occ of OCCUPATIONS) {
                    sum += cohort?.[edu]?.[occ] ?? 0;
                }
                eduRow[EDU_LABELS[edu]] = sum;
                eduAgeTotal += sum;
            }
            eduRow._total = eduAgeTotal;
            eduRows.push(eduRow);

            if (ageTotal > 0) {
                received += ageTotal;
            } else {
                given += -ageTotal;
            }
        }

        return { occData: occRows, eduData: eduRows, totalReceived: received, totalGiven: given };
    }, [matrix]);

    useEffect(() => {
        if (occData.length > 0) {
            lastOccData.current = occData;
        }
        if (eduData.length > 0) {
            lastEduData.current = eduData;
        }
    }, [occData, eduData]);

    // Down-sample on small screens by merging adjacent age pairs
    const displayOccData = useMemo(
        () => (isSmallScreen ? mergePairs(occData, OCC_MERGE_KEYS) : occData),
        [occData, isSmallScreen],
    );
    const displayEduData = useMemo(
        () => (isSmallScreen ? mergePairs(eduData, EDU_MERGE_KEYS) : eduData),
        [eduData, isSmallScreen],
    );

    const chartData = viewMode === 'occupation' ? displayOccData : displayEduData;

    const yDomain = useMemo<[number, number]>(() => {
        if (chartData.length === 0) {
            return lastYDomain.current;
        }
        let min = 0;
        let max = 0;
        for (const row of chartData) {
            const v = Number(row._total ?? 0);
            if (v < min) {
                min = v;
            }
            if (v > max) {
                max = v;
            }
        }
        const pad = Math.max(Math.abs(min), Math.abs(max)) * 0.1 || 1;
        const domain: [number, number] = [min - pad, max + pad];
        lastYDomain.current = domain;
        return domain;
    }, [chartData]);

    const hasData = totalReceived > 0 || totalGiven > 0;

    return (
        <ChartCard title={title}>
            {/* Summary stats */}
            <div
                className={`flex flex-wrap gap-3 text-[10px] mb-2 ${hasData ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}
            >
                {hasData ? (
                    <>
                        <span>
                            Received: <span className='text-blue-500 font-medium'>{formatNumbers(totalReceived)}</span>
                        </span>
                        <span>
                            Given: <span className='text-green-600 font-medium'>{formatNumbers(totalGiven)}</span>
                        </span>
                        <span className='text-muted-foreground/60'>
                            (Δ = {formatNumbers(totalReceived - totalGiven)})
                        </span>
                    </>
                ) : (
                    <span>No active transfers this tick</span>
                )}
            </div>
            <ResponsiveContainer width='100%' height={240}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} stackOffset='sign'>
                    <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                    <YAxis
                        width={40}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => formatNumbers(v as number)}
                        domain={yDomain}
                    />
                    <Tooltip
                        content={({ active, payload, label }) => {
                            if (!active || !payload || payload.length === 0) {
                                return null;
                            }
                            const row = payload[0]?.payload as Record<string, number> | undefined;
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
                                                {formatNumbers(val)}
                                            </div>
                                        );
                                    })}
                                    <div className='mt-1 pt-1 border-t text-muted-foreground'>
                                        Total: {ageTotal > 0 ? '+' : ''}
                                        {formatNumbers(ageTotal)}
                                    </div>
                                </div>
                            );
                        }}
                    />
                    <Legend verticalAlign='top' height={20} wrapperStyle={{ fontSize: 10 }} />
                    <ReferenceLine y={0} stroke='#64748b' strokeWidth={1} />
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
        </ChartCard>
    );
}
