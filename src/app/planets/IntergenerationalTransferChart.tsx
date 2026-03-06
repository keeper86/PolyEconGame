'use client';

import React, { useState, useMemo } from 'react';
import {
    ResponsiveContainer,
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine,
    Cell,
} from 'recharts';
import type { Population, Cohort, FoodMarket } from '@/simulation/planet';
import { educationLevelKeys, OCCUPATIONS } from '@/simulation/planet';
import type { EducationLevelType, Occupation } from '@/simulation/planet';
import { CHILD_MAX_AGE, ELDERLY_MIN_AGE } from '@/simulation/constants';
import CohortFilter, { type CohortFilterState } from './CohortFilter';

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
/*  Data row                                                           */
/* ------------------------------------------------------------------ */

interface TransferRow {
    age: number;
    /** Population in the filtered slice at this age. */
    pop: number;
    /**
     * Net transfer per person at this age.
     * Positive = net receiver (children, elderly, disabled).
     * Negative = net giver (working-age supporter).
     */
    netTransferPerPerson: number;
    /** Total net transfer (netTransferPerPerson × pop). */
    netTransferTotal: number;
    /** Role label: 'child', 'elderly', 'disabled', 'supporter', 'neutral' */
    role: string;
    /** Mean wealth per person in this age slice. */
    meanWealth: number;
}

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
 * IntergenerationalTransferChart — balance chart around zero showing
 * which age cohorts are net givers vs. net receivers of wealth.
 *
 * Reads pre-computed transfer balances from `foodMarket.lastTransferBalances`
 * (written by the backend each tick) so no client-side simulation is needed.
 *
 * Transfer priority (backend — 4 phases):
 * 1. Supporter survival food (~55% of target)
 * 2. Dependent daily consumption (1 tick)
 * 3. Supporter buffer filling (precautionary reserve)
 * 4. Dependent buffer filling (full food target)
 *
 * Dependent categories: children (0–25), elderly (67+), disabled (26–66).
 * Received and Given totals always balance (zero-sum system).
 */
export default function IntergenerationalTransferChart({ population, foodMarket }: Props): React.ReactElement {
    const [filter, setFilter] = useState<CohortFilterState>({ edu: null, occ: null });

    const demography = population.demography;
    const wealthDem = population.wealthDemography;

    const chartData = useMemo<TransferRow[]>(() => {
        if (!wealthDem || wealthDem.length === 0) {
            return [];
        }

        // Read pre-computed per-age net transfer balances from backend state.
        // Falls back to an empty (all-zero) array if not yet available.
        const balances: number[] = foodMarket?.lastTransferBalances ?? new Array<number>(demography.length).fill(0);

        const edus: readonly EducationLevelType[] = filter.edu ? [filter.edu] : educationLevelKeys;
        const occs: readonly Occupation[] = filter.occ ? [filter.occ] : ([...OCCUPATIONS] as Occupation[]);

        const rows: TransferRow[] = [];
        for (let age = 0; age < demography.length; age++) {
            const cohort: Cohort | undefined = demography[age];
            if (!cohort) {
                continue;
            }

            // Filtered population & wealth
            let totalPop = 0;
            let totalWealth = 0;
            let filteredPop = 0;
            let fullPop = 0;
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    const pop = Number(cohort[edu]?.[occ] ?? 0);
                    fullPop += pop;
                }
            }
            for (const edu of edus) {
                for (const occ of occs) {
                    const pop = Number(cohort[edu]?.[occ] ?? 0);
                    if (pop <= 0) {
                        continue;
                    }
                    filteredPop += pop;
                    totalPop += pop;
                    const wm = wealthDem[age]?.[edu]?.[occ];
                    totalWealth += (wm ? wm.mean : 0) * pop;
                }
            }

            // Scale the balance proportionally to the filtered population share
            const scale = fullPop > 0 ? filteredPop / fullPop : 0;
            const netTotal = balances[age] * scale;
            const netPerPerson = totalPop > 0 ? netTotal / totalPop : 0;

            let role: string;
            if (age <= CHILD_MAX_AGE) {
                role = netTotal > 0 ? 'child' : netTotal < 0 ? 'supporter' : 'neutral';
            } else if (age >= ELDERLY_MIN_AGE) {
                role = netTotal > 0 ? 'elderly' : netTotal < 0 ? 'supporter' : 'neutral';
            } else if (netTotal > 0) {
                role = 'disabled';
            } else if (netTotal < 0) {
                role = 'supporter';
            } else {
                role = 'neutral';
            }

            rows.push({
                age,
                pop: totalPop,
                netTransferPerPerson: netPerPerson,
                netTransferTotal: netTotal,
                role,
                meanWealth: totalPop > 0 ? totalWealth / totalPop : 0,
            });
        }
        return rows;
    }, [demography, wealthDem, foodMarket?.lastTransferBalances, filter.edu, filter.occ]);

    if (chartData.length === 0 || !wealthDem) {
        return <div className='text-xs text-muted-foreground'>No transfer data available</div>;
    }

    const hasData = chartData.some((d) => d.netTransferTotal !== 0);
    if (!hasData) {
        return <div className='text-xs text-muted-foreground'>No intergenerational transfers active</div>;
    }

    // Summary stats — actual transfers (should balance to ~0)
    const totalReceived = chartData.reduce((s, d) => s + Math.max(0, d.netTransferTotal), 0);
    const totalGiven = chartData.reduce((s, d) => s + Math.max(0, -d.netTransferTotal), 0);

    const roleColors: Record<string, string> = {
        child: '#60a5fa', // blue
        elderly: '#f59e0b', // amber
        disabled: '#ef4444', // red
        supporter: '#16a34a', // green
        neutral: '#94a3b8', // gray
    };

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
                {/* Role legend */}
                <div className='flex items-center gap-2 text-[10px] text-muted-foreground shrink-0 flex-wrap'>
                    {(
                        [
                            ['child', `Children (0–${CHILD_MAX_AGE})`],
                            ['elderly', `Elderly (${ELDERLY_MIN_AGE}+)`],
                            ['disabled', 'Disabled'],
                            ['supporter', 'Supporters'],
                        ] as const
                    ).map(([key, label]) => (
                        <span key={key} className='flex items-center gap-0.5'>
                            <span
                                className='inline-block h-2 w-2 rounded-full'
                                style={{ backgroundColor: roleColors[key] }}
                            />
                            {label}
                        </span>
                    ))}
                </div>
            </div>

            {/* Filter badges */}
            <div className='mb-2'>
                <CohortFilter value={filter} onChange={setFilter} compact />
            </div>

            <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    <ComposedChart data={chartData} margin={{ top: 6, right: 12, left: 12, bottom: 6 }}>
                        <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                        <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                        <YAxis
                            yAxisId='transfer'
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => fmt(v)}
                            label={{
                                value: 'Net transfer (per person)',
                                angle: -90,
                                position: 'insideLeft',
                                style: { fontSize: 9 },
                            }}
                        />
                        <YAxis
                            yAxisId='wealth'
                            orientation='right'
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => fmt(v)}
                            label={{
                                value: 'Mean wealth',
                                angle: 90,
                                position: 'insideRight',
                                style: { fontSize: 9 },
                            }}
                        />

                        <Tooltip
                            content={({ active, payload, label }) => {
                                if (!active || !payload || payload.length === 0) {
                                    return null;
                                }
                                const row = payload[0]?.payload as TransferRow | undefined;
                                if (!row) {
                                    return null;
                                }
                                return (
                                    <div className='rounded-lg border bg-card p-2 text-xs shadow-md min-w-[180px]'>
                                        <div className='font-medium mb-1'>
                                            Age {label}{' '}
                                            <span className='ml-1' style={{ color: roleColors[row.role] }}>
                                                ({row.role})
                                            </span>
                                        </div>
                                        <div>Population: {fmt(row.pop)}</div>
                                        <div>
                                            Net transfer/person:{' '}
                                            <span
                                                className={
                                                    row.netTransferPerPerson > 0
                                                        ? 'text-blue-500'
                                                        : row.netTransferPerPerson < 0
                                                          ? 'text-green-600'
                                                          : ''
                                                }
                                            >
                                                {row.netTransferPerPerson > 0 ? '+' : ''}
                                                {fmt(row.netTransferPerPerson)}
                                            </span>
                                        </div>
                                        <div>Net total: {fmt(row.netTransferTotal)}</div>
                                        <div>Mean wealth: {fmt(row.meanWealth)}</div>
                                    </div>
                                );
                            }}
                        />
                        <Legend verticalAlign='top' height={20} />

                        {/* Zero reference line */}
                        <ReferenceLine yAxisId='transfer' y={0} stroke='#64748b' strokeWidth={1} />

                        {/* Transfer balance bars — diverging around 0 */}
                        <Bar
                            yAxisId='transfer'
                            dataKey='netTransferPerPerson'
                            name='Net transfer/person'
                            isAnimationActive={false}
                        >
                            {chartData.map((row, idx) => (
                                <Cell key={idx} fill={roleColors[row.role] ?? '#94a3b8'} fillOpacity={0.8} />
                            ))}
                        </Bar>

                        {/* Mean wealth line overlay */}
                        <Line
                            yAxisId='wealth'
                            type='monotone'
                            dataKey='meanWealth'
                            stroke='#8b5cf6'
                            strokeWidth={1.5}
                            dot={false}
                            name='Mean wealth'
                            isAnimationActive={false}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
