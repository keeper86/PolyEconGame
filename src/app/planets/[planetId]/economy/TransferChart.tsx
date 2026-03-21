'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ReferenceLine } from 'recharts';
import { CHILD_MAX_AGE, ELDERLY_MIN_AGE } from '@/simulation/constants';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EDU_COLORS, EDU_LABELS, OCC_COLORS, OCC_LABELS } from '../../components/CohortFilter';
import ChartCard from '../../components/ChartCard';
import { educationLevelKeys } from '@/simulation/population/education';
import type { PopulationTransferMatrix } from '@/simulation/population/population';
import { OCCUPATIONS } from '@/simulation/population/population';
import { formatNumbers } from '@/lib/utils';

type ViewMode = 'occupation' | 'education';

type Props = {
    title: string;
    matrix: PopulationTransferMatrix | undefined;
    yMin?: number;
    yMax?: number;
};

export default function TransferChart({ title, matrix, yMin, yMax }: Props): React.ReactElement {
    const [viewMode, setViewMode] = useState<ViewMode>('occupation');

    const lastOccData = useRef<Record<string, number | string>[]>([]);
    const lastEduData = useRef<Record<string, number | string>[]>([]);
    const lastYDomain = useRef<[number, number]>([-1, 1]);

    const { occData, eduData, totalReceived, totalGiven } = useMemo(() => {
        if (!matrix || matrix.length === 0) {
            return { occData: lastOccData.current, eduData: lastEduData.current, totalReceived: 0, totalGiven: 0 };
        }

        const occRows: Record<string, number | string>[] = [];
        const eduRows: Record<string, number | string>[] = [];
        let received = 0;
        let given = 0;

        for (let age = 0; age < matrix.length; age++) {
            const cohort = matrix[age];

            const occRow: Record<string, number | string> = { age };
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

            const eduRow: Record<string, number | string> = { age };
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

    const yDomain = useMemo<[number, number]>(() => {
        if (typeof yMin === 'number' && typeof yMax === 'number') {
            const domain: [number, number] = [yMin, yMax];
            lastYDomain.current = domain;
            return domain;
        }
        const data = viewMode === 'occupation' ? occData : eduData;
        if (data.length === 0) {
            return lastYDomain.current;
        }
        let min = 0;
        let max = 0;
        for (const row of data) {
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
    }, [occData, eduData, viewMode, yMin, yMax]);

    const hasData = totalReceived > 0 || totalGiven > 0;
    const chartData = viewMode === 'occupation' ? occData : eduData;

    return (
        <ChartCard
            title={title}
            primaryControls={
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                    <TabsList className='h-7'>
                        <TabsTrigger value='occupation' className='text-[10px] px-2 py-0.5'>
                            By occupation
                        </TabsTrigger>
                        <TabsTrigger value='education' className='text-[10px] px-2 py-0.5'>
                            By education
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            }
        >
            {/* Summary stats */}
            <div
                className={`flex gap-3 text-[10px] mb-2 ${hasData ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}
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
                        <span className='ml-auto text-muted-foreground/60'>
                            Children: 0–{CHILD_MAX_AGE} · Elderly: {ELDERLY_MIN_AGE}+
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
