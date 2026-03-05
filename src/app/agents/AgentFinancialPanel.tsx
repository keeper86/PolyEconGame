'use client';

import React from 'react';
import { Coins, Landmark, TrendingDown, TrendingUp } from 'lucide-react';
import type { EducationLevelType, WorkforceDemography } from '@/simulation/planet';
import { educationLevelKeys } from '@/simulation/planet';
import { DEFAULT_WAGE_PER_EDU } from '@/simulation/financial/financialTick';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n: number): string =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : n.toFixed(2);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Props = {
    /** Current firm deposit balance (currency units). */
    deposits: number;
    /** Per-planet workforce demography (for wage-bill estimate). */
    workforceDemography?: WorkforceDemography;
    /** Planet's wage-per-edu schedule, if set. */
    wagePerEdu?: Partial<Record<EducationLevelType, number>>;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Estimate the wage bill from the workforce demography snapshot. */
function estimateWageBill(
    wfd: WorkforceDemography,
    wagePerEdu: Partial<Record<EducationLevelType, number>>,
): { total: number; byEdu: Record<EducationLevelType, number> } {
    const byEdu = {} as Record<EducationLevelType, number>;
    let total = 0;
    for (const edu of educationLevelKeys) {
        byEdu[edu] = 0;
    }
    for (const cohort of wfd) {
        for (const edu of educationLevelKeys) {
            const activeCount = cohort.active[edu]?.count ?? 0;
            // Also count departing workers — they still receive wages until they leave.
            const departingCount = (cohort.departing[edu] ?? []).reduce(
                (s: number, m: { count: number }) => s + m.count,
                0,
            );
            const wage = wagePerEdu[edu] ?? DEFAULT_WAGE_PER_EDU;
            const bill = (activeCount + departingCount) * wage;
            byEdu[edu] += bill;
            total += bill;
        }
    }
    return { total, byEdu };
}

/** Aggregate worker counts from the workforce demography (wealth no longer tracked here). */
function aggregateWealthStats(wfd: WorkforceDemography): {
    byEdu: Record<EducationLevelType, { mean: number; workers: number }>;
    totalWorkers: number;
} {
    const byEdu = {} as Record<EducationLevelType, { mean: number; workers: number }>;
    for (const edu of educationLevelKeys) {
        byEdu[edu] = { mean: 0, workers: 0 };
    }
    let totalWorkers = 0;

    for (const cohort of wfd) {
        for (const edu of educationLevelKeys) {
            const activeCount = cohort.active[edu]?.count ?? 0;
            if (activeCount > 0) {
                byEdu[edu].workers += activeCount;
                totalWorkers += activeCount;
            }
        }
    }
    return { byEdu, totalWorkers };
}

/* ------------------------------------------------------------------ */
/*  Stat row                                                           */
/* ------------------------------------------------------------------ */

function Stat({
    label,
    value,
    icon,
    valueClassName,
}: {
    label: string;
    value: React.ReactNode;
    icon?: React.ReactNode;
    valueClassName?: string;
}): React.ReactElement {
    return (
        <div className='flex items-baseline justify-between gap-2'>
            <span className='flex items-center gap-1 text-xs text-muted-foreground truncate'>
                {icon}
                {label}
            </span>
            <span className={`tabular-nums whitespace-nowrap text-xs font-medium ${valueClassName ?? ''}`}>
                {value}
            </span>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentFinancialPanel({ deposits, workforceDemography, wagePerEdu }: Props): React.ReactElement {
    const wageBill =
        workforceDemography && workforceDemography.length > 0
            ? estimateWageBill(workforceDemography, wagePerEdu ?? {})
            : null;

    const wealthStats =
        workforceDemography && workforceDemography.length > 0 ? aggregateWealthStats(workforceDemography) : null;

    const cashCoversTicks =
        wageBill && wageBill.total > 0 && deposits > 0 ? Math.floor(deposits / wageBill.total) : null;

    return (
        <div className='border rounded-md p-3 space-y-3'>
            {/* Header */}
            <div className='flex items-center gap-2'>
                <Landmark className='h-4 w-4 text-muted-foreground' />
                <span className='text-sm font-semibold'>Financial Position</span>
            </div>

            {/* Balance */}
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1'>
                <Stat
                    label='Firm deposits'
                    value={fmt(deposits)}
                    icon={<Landmark className='h-3 w-3' />}
                    valueClassName={deposits < 0 ? 'text-red-500' : deposits === 0 ? 'text-muted-foreground' : ''}
                />
                {wageBill !== null && (
                    <>
                        <Stat
                            label='Est. wage bill / tick'
                            value={fmt(wageBill.total)}
                            icon={<TrendingDown className='h-3 w-3' />}
                            valueClassName={wageBill.total > 0 ? 'text-amber-500' : ''}
                        />
                        {cashCoversTicks !== null && (
                            <Stat
                                label='Ticks of cash coverage'
                                value={cashCoversTicks}
                                icon={<TrendingUp className='h-3 w-3' />}
                                valueClassName={cashCoversTicks < 2 ? 'text-red-500' : 'text-green-600'}
                            />
                        )}
                    </>
                )}
            </div>

            {/* Wage bill breakdown by education */}
            {wageBill !== null && wageBill.total > 0 && (
                <div>
                    <div className='flex items-center gap-1 text-xs text-muted-foreground mb-1'>
                        <Coins className='h-3 w-3' />
                        Wage bill by education
                    </div>
                    <div className='grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5'>
                        {educationLevelKeys
                            .filter((edu) => wageBill.byEdu[edu] > 0)
                            .map((edu) => (
                                <div key={edu} className='flex items-baseline justify-between text-xs gap-2'>
                                    <span className='text-muted-foreground capitalize'>{edu}</span>
                                    <span className='tabular-nums font-medium'>{fmt(wageBill.byEdu[edu])}</span>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* Worker wealth by education */}
            {wealthStats !== null && wealthStats.totalWorkers > 0 && (
                <div>
                    <div className='flex items-center gap-1 text-xs text-muted-foreground mb-1'>
                        <Coins className='h-3 w-3' />
                        Avg. worker wealth by education
                    </div>
                    <div className='grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5'>
                        {educationLevelKeys
                            .filter((edu) => wealthStats.byEdu[edu].workers > 0)
                            .map((edu) => (
                                <div key={edu} className='flex items-baseline justify-between text-xs gap-2'>
                                    <span className='text-muted-foreground capitalize'>{edu}</span>
                                    <span className='tabular-nums font-medium'>
                                        {fmt(wealthStats.byEdu[edu].mean)}
                                        <span className='text-muted-foreground ml-1'>
                                            ({wealthStats.byEdu[edu].workers.toLocaleString()} w)
                                        </span>
                                    </span>
                                </div>
                            ))}
                    </div>
                </div>
            )}
        </div>
    );
}
