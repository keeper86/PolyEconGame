'use client';

import React from 'react';
import type { EducationLevelType } from '../../simulation/planet';
import { educationLevelKeys } from '../../simulation/planet';
import { Badge } from '../../components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../components/ui/tooltip';
import { eduLabel, fmt, EDU_COLORS, sumByEdu } from './workforce-theme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format "next (total)" for on-notice pipeline values. */
function fmtNextTotal(next: number, total: number): string {
    if (total <= 0) {
        return '—';
    }
    if (next > 0) {
        return `${fmt(next)}  (${fmt(total)})`;
    }
    return `—  (${fmt(total)})`;
}

// ---------------------------------------------------------------------------
// Stat row — a label/value pair with optional indent level
// ---------------------------------------------------------------------------

function Stat({
    label,
    value,
    valueClassName,
    indent,
    bold,
}: {
    label: React.ReactNode;
    value: React.ReactNode;
    valueClassName?: string;
    indent?: boolean;
    bold?: boolean;
}): React.ReactElement {
    return (
        <div className={`flex items-baseline justify-between gap-2 ${indent ? 'pl-3' : ''}`}>
            <span className={`truncate ${bold ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {label}
            </span>
            <span
                className={`tabular-nums whitespace-nowrap ${bold ? 'font-semibold' : 'font-medium'} ${valueClassName ?? ''}`}
            >
                {value}
            </span>
        </div>
    );
}

/** Thin horizontal rule between sections. */
function Rule(): React.ReactElement {
    return <div className='border-t border-dashed my-1.5' />;
}

// ---------------------------------------------------------------------------
// Per-education card (also used for the "Total" summary card)
// ---------------------------------------------------------------------------

function EducationCard({
    label,
    badgeClassName,
    target,
    active,
    unused,
    // number of overqualified workers filling slots for this job edu
    overqualified,
    // breakdown: workerEdu -> count for this job edu
    overqualifiedBreakdown,
    // On-notice pipeline
    voluntaryNext,
    voluntaryTotal,
    firedNext,
    firedTotal,
    retiringNext,
    retiringTotal,
    // Demographics & productivity
    meanAge,
    ageProd,
    meanTenure,
    tenureProd,
    hasWorkers,
    isTotal,
}: {
    label: string;
    badgeClassName: string;
    target: number;
    active: number;
    unused: number;
    overqualified?: number;
    overqualifiedBreakdown?: { [workerEdu in EducationLevelType]?: number };
    voluntaryNext: number;
    voluntaryTotal: number;
    firedNext: number;
    firedTotal: number;
    retiringNext: number;
    retiringTotal: number;
    meanAge: number;
    ageProd: number;
    meanTenure: number;
    tenureProd: number;
    hasWorkers: boolean;
    isTotal?: boolean;
}): React.ReactElement {
    const totalOnNotice = voluntaryTotal + firedTotal + retiringTotal;
    const totalWorkforce = active + totalOnNotice;
    const combinedProd = ageProd * tenureProd;
    // On-notice next-month total and collapsed state
    const totalNextOnNotice = voluntaryNext + firedNext + retiringNext;
    const [onNoticeOpen, setOnNoticeOpen] = React.useState(true);
    const onNoticeId = React.useId();

    return (
        <div
            className={`min-w-[240px] max-w-[260px] flex-1 rounded-lg border p-3 space-y-0.5 text-xs ${isTotal ? 'border-2 bg-muted/10' : ''} ${hasWorkers || isTotal ? '' : 'opacity-60'}`}
        >
            {/* Header */}
            <Badge variant='outline' className={`text-xs px-1.5 py-0.5 mb-1 ${badgeClassName}`}>
                {label}
            </Badge>

            {/* ── Headcount ── */}
            <Stat
                label='Target'
                value={
                    <>
                        {fmt(target)}
                        {overqualified && overqualified > 0 ? (
                            <Tooltip>
                                <TooltipTrigger>
                                    <span className='text-amber-600 ml-1 tabular-nums'>({fmt(overqualified)})</span>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={6}>
                                    <div className='max-w-xs'>
                                        <div className='font-medium'>Overqualified workers</div>
                                        <div className='text-xs text-muted-foreground mt-1'>
                                            Facilities filled {fmt(overqualified)} slot{overqualified !== 1 ? 's' : ''}{' '}
                                            with higher-educated workers because lower-education workers were not
                                            available.
                                        </div>
                                        {overqualifiedBreakdown && (
                                            <div className='mt-2 text-xs'>
                                                {Object.entries(overqualifiedBreakdown)
                                                    .filter(([, v]) => v && v > 0)
                                                    .map(([wEdu, count]) => (
                                                        <div key={wEdu} className='text-amber-600'>
                                                            {eduLabel(wEdu as EducationLevelType)} ×{count}
                                                        </div>
                                                    ))}
                                            </div>
                                        )}
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        ) : null}
                    </>
                }
            />
            <Stat label='Total' value={fmt(totalWorkforce)} valueClassName='text-foreground' bold />
            <Stat
                label='Worker '
                value={`${unused >= 0 ? '+' : '−'}${fmt(Math.abs(unused))}`}
                valueClassName={unused > 0 ? 'text-green-600' : unused < 0 ? 'text-red-500' : 'text-muted-foreground'}
            />

            <Rule />

            {/* ── Breakdown: Active + On notice = Total ── */}
            <Stat label='Active' value={fmt(active)} />
            {/* On-notice — collapsible breakdown. The total (with next-month counter) stays visible */}
            <div className='flex items-baseline justify-between gap-2'>
                <button
                    type='button'
                    onClick={() => setOnNoticeOpen((s) => !s)}
                    aria-expanded={onNoticeOpen}
                    aria-controls={onNoticeId}
                    className='flex items-center gap-2 text-left'
                >
                    <span className='truncate text-muted-foreground'>On notice</span>
                    <svg
                        className={`w-3 h-3 text-muted-foreground transition-transform ${onNoticeOpen ? 'rotate-180' : ''}`}
                        viewBox='0 0 20 20'
                        fill='none'
                        aria-hidden
                    >
                        <path
                            d='M5 8l5 5 5-5'
                            stroke='currentColor'
                            strokeWidth='1.5'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                        />
                    </svg>
                </button>

                <span
                    className={`tabular-nums whitespace-nowrap ${totalOnNotice > 0 ? 'text-orange-500' : 'text-muted-foreground'}`}
                >
                    {fmtNextTotal(totalNextOnNotice, totalOnNotice)}
                </span>
            </div>

            {onNoticeOpen && (
                <>
                    <div id={onNoticeId} className='pl-3 text-[10px] text-muted-foreground mb-0.5'>
                        next mo · (pipeline)
                    </div>
                    <Stat
                        label='Voluntary'
                        value={fmtNextTotal(voluntaryNext, voluntaryTotal)}
                        valueClassName={voluntaryTotal > 0 ? 'text-amber-600' : 'text-muted-foreground'}
                        indent
                    />
                    <Stat
                        label='Fired'
                        value={fmtNextTotal(firedNext, firedTotal)}
                        valueClassName={firedTotal > 0 ? 'text-red-500' : 'text-muted-foreground'}
                        indent
                    />
                    <Stat
                        label='Retiring'
                        value={fmtNextTotal(retiringNext, retiringTotal)}
                        valueClassName={retiringTotal > 0 ? 'text-violet-600' : 'text-muted-foreground'}
                        indent
                    />
                </>
            )}

            <Rule />

            {/* ── Demographics & Productivity ── */}
            <div className='flex items-baseline justify-between gap-2'>
                <span className='text-muted-foreground'>Age / Tenure</span>
                <span className='tabular-nums font-medium'>
                    {hasWorkers ? `${meanAge.toFixed(1)}` : '—'}
                    <span className='text-muted-foreground mx-0.5'>/</span>
                    {hasWorkers ? `${meanTenure.toFixed(1)}y` : '—'}
                </span>
            </div>
            <div className='flex items-baseline justify-between gap-2'>
                <span className='text-muted-foreground'>Productivity</span>
                <span
                    className={`tabular-nums font-medium ${
                        hasWorkers && combinedProd < 1.0
                            ? 'text-red-500'
                            : hasWorkers && combinedProd >= 1.2
                              ? 'text-green-600'
                              : ''
                    }`}
                >
                    {hasWorkers ? (
                        <>
                            <span className={ageProd < 0.95 ? 'text-amber-600' : ''}>×{ageProd.toFixed(2)}</span>
                            <span className='text-muted-foreground mx-0.5'>·</span>
                            <span className={tenureProd < 1.1 ? 'text-amber-600' : ''}>×{tenureProd.toFixed(2)}</span>
                            <span className='text-muted-foreground mx-0.5'>=</span>×{combinedProd.toFixed(2)}
                        </>
                    ) : (
                        '—'
                    )}
                </span>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Grid of education cards + totals summary
// ---------------------------------------------------------------------------

export function EducationLevelCards({
    allocatedWorkers,
    activeByEdu,
    retiringByEdu,
    firedByEdu,
    voluntaryByEdu,
    nextMonthVoluntaryByEdu,
    nextMonthFiredByEdu,
    nextMonthRetiringByEdu,
    unusedWorkers,
    overqualifiedByEdu,
    overqualifiedBreakdown,
    meanAgeByEdu,
    ageProductivityByEdu,
    meanTenureByEdu,
    tenureProductivityByEdu,
    overallMeanAge,
    overallAgeProductivity,
    overallMeanTenure,
    overallTenureProductivity,
}: {
    allocatedWorkers: Record<EducationLevelType, number>;
    activeByEdu: Record<EducationLevelType, number>;
    retiringByEdu: Record<EducationLevelType, number>;
    firedByEdu: Record<EducationLevelType, number>;
    voluntaryByEdu: Record<EducationLevelType, number>;
    nextMonthVoluntaryByEdu: Record<EducationLevelType, number>;
    nextMonthFiredByEdu: Record<EducationLevelType, number>;
    nextMonthRetiringByEdu: Record<EducationLevelType, number>;
    unusedWorkers?: Record<EducationLevelType, number>;
    meanAgeByEdu: Record<EducationLevelType, number>;
    ageProductivityByEdu: Record<EducationLevelType, number>;
    meanTenureByEdu: Record<EducationLevelType, number>;
    tenureProductivityByEdu: Record<EducationLevelType, number>;
    overallMeanAge: number;
    overallAgeProductivity: number;
    overallMeanTenure: number;
    overallTenureProductivity: number;
    overqualifiedByEdu?: Record<EducationLevelType, number>;
    overqualifiedBreakdown?: { [jobEdu in EducationLevelType]?: { [workerEdu in EducationLevelType]?: number } };
}): React.ReactElement {
    const totalActive = sumByEdu(activeByEdu);
    const totalRet = sumByEdu(retiringByEdu);
    const totalFired = sumByEdu(firedByEdu);
    const totalVol = sumByEdu(voluntaryByEdu);
    const totalUnused = unusedWorkers ? sumByEdu(unusedWorkers) : 0;
    const totalOverqualified = overqualifiedByEdu ? sumByEdu(overqualifiedByEdu) : 0;

    return (
        <div className='flex flex-wrap gap-3'>
            {educationLevelKeys.map((edu) => (
                <EducationCard
                    key={edu}
                    label={eduLabel(edu)}
                    badgeClassName={EDU_COLORS[edu].badge}
                    target={allocatedWorkers[edu] ?? 0}
                    active={activeByEdu[edu]}
                    unused={unusedWorkers?.[edu] ?? 0}
                    overqualified={overqualifiedByEdu?.[edu] ?? 0}
                    overqualifiedBreakdown={overqualifiedBreakdown?.[edu]}
                    voluntaryNext={nextMonthVoluntaryByEdu[edu]}
                    voluntaryTotal={voluntaryByEdu[edu]}
                    firedNext={nextMonthFiredByEdu[edu]}
                    firedTotal={firedByEdu[edu]}
                    retiringNext={nextMonthRetiringByEdu[edu]}
                    retiringTotal={retiringByEdu[edu]}
                    meanAge={meanAgeByEdu[edu]}
                    ageProd={ageProductivityByEdu[edu]}
                    meanTenure={meanTenureByEdu[edu]}
                    tenureProd={tenureProductivityByEdu[edu]}
                    hasWorkers={activeByEdu[edu] > 0}
                />
            ))}
            {/* Total card */}
            <EducationCard
                label='Total'
                badgeClassName='border-foreground/30 bg-muted text-foreground font-semibold'
                target={sumByEdu(allocatedWorkers)}
                active={totalActive}
                unused={totalUnused}
                overqualified={totalOverqualified}
                voluntaryNext={sumByEdu(nextMonthVoluntaryByEdu)}
                voluntaryTotal={totalVol}
                firedNext={sumByEdu(nextMonthFiredByEdu)}
                firedTotal={totalFired}
                retiringNext={sumByEdu(nextMonthRetiringByEdu)}
                retiringTotal={totalRet}
                meanAge={overallMeanAge}
                ageProd={overallAgeProductivity}
                meanTenure={overallMeanTenure}
                tenureProd={overallTenureProductivity}
                hasWorkers={totalActive > 0}
                isTotal
            />
        </div>
    );
}
