'use client';

import { useIsSmallScreen } from '@/hooks/useMobile';
import { formatNumberWithUnit } from '@/lib/utils';
import { educationLevelKeys } from '@/simulation/population/education';
import type { PopulationTransferMatrix } from '@/simulation/population/population';
import { OCCUPATIONS } from '@/simulation/population/population';
import React, { useEffect, useMemo, useRef } from 'react';
import { Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EDU_COLORS, OCC_COLORS, useCohortLabels } from './CohortFilter';
import type { GroupMode } from './demographicsTypes';
import { useLocale, useTranslations } from 'next-intl';

type Props = {
    matrix: PopulationTransferMatrix | undefined;
    viewMode: GroupMode;
};

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

export default function TransferChart({ matrix, viewMode }: Props): React.ReactElement {
    const locale = useLocale();
    const t = useTranslations('Demographics');
    const isSmallScreen = useIsSmallScreen();
    const { edu: eduLabels, occ: occLabels } = useCohortLabels();

    const lastOccData = useRef<Record<string, number>[]>([]);
    const lastEduData = useRef<Record<string, number>[]>([]);
    const lastYDomain = useRef<[number, number]>([-1, 1]);

    const { occData, eduData } = useMemo(() => {
        if (!matrix || matrix.length === 0) {
            return { occData: lastOccData.current, eduData: lastEduData.current };
        }

        const occRows: Record<string, number>[] = [];
        const eduRows: Record<string, number>[] = [];

        for (let age = 0; age < matrix.length; age++) {
            const cohort = matrix[age];

            const occRow: Record<string, number> = { age };
            let ageTotal = 0;
            for (const occ of OCCUPATIONS) {
                let sum = 0;
                for (const edu of educationLevelKeys) {
                    sum += cohort?.[edu]?.[occ] ?? 0;
                }
                occRow[occLabels[occ]] = sum;
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
                eduRow[eduLabels[edu]] = sum;
                eduAgeTotal += sum;
            }
            eduRow._total = eduAgeTotal;
            eduRows.push(eduRow);
        }

        return { occData: occRows, eduData: eduRows };
    }, [matrix, occLabels, eduLabels]);

    useEffect(() => {
        if (occData.length > 0) {
            lastOccData.current = occData;
        }
        if (eduData.length > 0) {
            lastEduData.current = eduData;
        }
    }, [occData, eduData]);

    const occMergeKeys = useMemo(() => [...OCCUPATIONS.map((occ) => occLabels[occ]), '_total'], [occLabels]);
    const eduMergeKeys = useMemo(() => [...educationLevelKeys.map((edu) => eduLabels[edu]), '_total'], [eduLabels]);

    const displayOccData = useMemo(
        () => (isSmallScreen ? mergePairs(occData, occMergeKeys) : occData),
        [occData, isSmallScreen, occMergeKeys],
    );
    const displayEduData = useMemo(
        () => (isSmallScreen ? mergePairs(eduData, eduMergeKeys) : eduData),
        [eduData, isSmallScreen, eduMergeKeys],
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

    return (
        <ResponsiveContainer width='100%' height={240}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} stackOffset='sign'>
                <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                <YAxis
                    width={40}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => formatNumberWithUnit(v as number, 'persons', undefined, locale)}
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
                                <div className='font-medium mb-1'>{t('tooltipAge', { age: String(label) })}</div>
                                {payload.map((entry) => {
                                    const val = Number(entry.value ?? 0);
                                    if (Math.abs(val) < 1e-6) {
                                        return null;
                                    }
                                    return (
                                        <div key={entry.dataKey as string} style={{ color: entry.color }}>
                                            {entry.name}: {val > 0 ? '+' : ''}
                                            {formatNumberWithUnit(val, 'persons', undefined, locale)}
                                        </div>
                                    );
                                })}
                                <div className='mt-1 pt-1 border-t text-muted-foreground'>
                                    {t('totalLabel')} {ageTotal > 0 ? '+' : ''}
                                    {formatNumberWithUnit(ageTotal, 'persons', undefined, locale)}
                                </div>
                            </div>
                        );
                    }}
                />
                <ReferenceLine y={0} stroke='#64748b' strokeWidth={1} />
                {viewMode === 'occupation'
                    ? OCCUPATIONS.map((occ) => (
                          <Bar
                              key={occ}
                              dataKey={occLabels[occ]}
                              stackId='a'
                              fill={OCC_COLORS[occ]}
                              isAnimationActive={false}
                          />
                      ))
                    : educationLevelKeys.map((edu) => (
                          <Bar
                              key={edu}
                              dataKey={eduLabels[edu]}
                              stackId='a'
                              fill={EDU_COLORS[edu]}
                              isAnimationActive={false}
                          />
                      ))}
            </BarChart>
        </ResponsiveContainer>
    );
}
