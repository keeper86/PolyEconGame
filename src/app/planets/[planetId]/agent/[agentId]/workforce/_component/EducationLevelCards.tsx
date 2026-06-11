'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { eduLabel, EDU_COLORS, sumByEdu, CHART_COLORS } from './workforceTheme';
import type { EducationLevelType } from '@/simulation/population/education';
import { educationLevelKeys } from '@/simulation/population/education';
import { formatNumberWithUnit } from '@/lib/utils';
import type { WorkforceSummary } from './workforceSummary';
import type { DemographicEventCounters } from '@/simulation/planet/planet';

export type EducationLevelCardsProps = {
    summary: WorkforceSummary;
    allocatedWorkers: Partial<Record<EducationLevelType, number>>;
    unusedWorkers?: Partial<Record<EducationLevelType, number>>;
    overqualified?: {
        byEdu?: Record<EducationLevelType, number>;
        breakdown?: { [jobEdu in EducationLevelType]?: { [workerEdu in EducationLevelType]?: number } };
    };
    deaths?: DemographicEventCounters;
    disabilities?: DemographicEventCounters;
};

function formatNumbersNextTotal(next: number, total: number): string {
    return `${formatNumberWithUnit(next, 'persons')}  (${formatNumberWithUnit(total, 'persons')})`;
}

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

function Rule(): React.ReactElement {
    return <div className='border-t border-dashed my-1.5' />;
}

function EducationCard({
    header,
    headcount,
    overqualified,
    onNotice,
    onboarding,
    demographicEvents,
    productivity,
    isTotal,
}: {
    header: { label: string; badgeClassName: string };
    headcount: { target: number; active: number; unused: number };
    overqualified?: { count?: number; breakdown?: { [workerEdu in EducationLevelType]?: number } };
    onNotice: {
        voluntaryNext: number;
        voluntaryTotal: number;
        firedNext: number;
        firedTotal: number;
        retiredNext: number;
        retiredTotal: number;
    };
    onboarding: { current: number; nextMonth: number };
    demographicEvents?: { deaths?: number; disabilities?: number };
    productivity: { meanAge: number; ageProd: number; meanTenure: number; tenureProd: number; hasWorkers: boolean };
    isTotal?: boolean;
}): React.ReactElement {
    const { label, badgeClassName } = header;
    const { target, active, unused } = headcount;
    const { count: overqualifiedCount, breakdown: overqualifiedBreakdown } = overqualified ?? {};
    const { voluntaryNext, voluntaryTotal, firedNext, firedTotal, retiredNext, retiredTotal } = onNotice;
    const { current: onboardingCurrent, nextMonth: onboardingNext } = onboarding;
    const { deaths, disabilities } = demographicEvents ?? {};
    const { meanAge, ageProd, meanTenure, tenureProd, hasWorkers } = productivity;
    const totalOnNotice = voluntaryTotal + firedTotal + retiredTotal;
    const totalWorkforce = active + onboardingCurrent + totalOnNotice;
    const combinedProd = ageProd * tenureProd;

    const totalNextOnNotice = voluntaryNext + firedNext + retiredNext;
    const [onNoticeOpen, setOnNoticeOpen] = React.useState(isTotal || totalOnNotice > 0);
    const onNoticeId = React.useId();
    const [onboardingOpen, setOnboardingOpen] = React.useState(isTotal || onboardingCurrent > 0);
    const onboardingId = React.useId();

    return (
        <div
            className={`min-w-[240px] max-w-[260px] flex-1 rounded-lg border p-3 space-y-0.5 text-xs ${isTotal ? 'border-2 bg-muted/10' : ''} ${hasWorkers || isTotal ? '' : 'opacity-60'}`}
        >
            <Badge variant='outline' className={`text-xs px-1.5 py-0.5 mb-1 ${badgeClassName}`}>
                {label}
            </Badge>

            <Stat
                label='Target'
                value={
                    <>
                        {formatNumberWithUnit(target, 'persons')}
                        {overqualifiedCount && overqualifiedCount > 0 ? (
                            <Tooltip>
                                <TooltipTrigger>
                                    <span className='text-amber-600 ml-1 tabular-nums'>
                                        ({formatNumberWithUnit(overqualifiedCount, 'persons')})
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={6}>
                                    <div className='max-w-xs'>
                                        <div className='font-medium'>Overqualified workers</div>
                                        <div className='text-xs text-muted-foreground mt-1'>
                                            Facilities filled {formatNumberWithUnit(overqualifiedCount, 'persons')} slot
                                            {overqualifiedCount !== 1 ? 's' : ''} with higher-educated workers because
                                            lower-education workers were not available.
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
            <Stat
                label='Current total'
                value={formatNumberWithUnit(totalWorkforce, 'persons')}
                valueClassName='text-foreground'
                bold
            />
            <Stat
                label={`${unused < 0 ? 'Worker shortage' : 'Unused Worker '}`}
                value={`${formatNumberWithUnit(Math.abs(unused), 'persons')}`}
                valueClassName={unused > 0 ? 'text-green-600' : unused < 0 ? 'text-red-500' : 'text-muted-foreground'}
            />

            <Rule />

            <Stat label='Active' value={formatNumberWithUnit(active, 'persons')} />

            <div className='flex items-baseline justify-between gap-2'>
                <button
                    type='button'
                    onClick={() => setOnboardingOpen((s) => !s)}
                    aria-expanded={onboardingOpen}
                    aria-controls={onboardingId}
                    className='flex items-center gap-2 text-left'
                >
                    <span className='truncate text-muted-foreground'>Onboarding</span>
                    <svg
                        className={`w-3 h-3 text-muted-foreground transition-transform ${onboardingOpen ? 'rotate-180' : ''}`}
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
                    className='tabular-nums whitespace-nowrap text-purple-500'
                    style={{ color: CHART_COLORS.onboarding }}
                >
                    {formatNumberWithUnit(onboardingCurrent, 'persons')}
                </span>
            </div>

            {onboardingOpen && (
                <>
                    <div id={onboardingId} className='pl-3 text-[10px] text-muted-foreground mb-0.5'>
                        next month
                    </div>
                    <Stat
                        label='Completing'
                        value={formatNumberWithUnit(onboardingNext, 'persons')}
                        valueClassName={onboardingNext > 0 ? 'text-violet-600' : 'text-muted-foreground'}
                        indent
                    />
                </>
            )}

            {typeof deaths === 'number' && (
                <Stat
                    label='Deaths'
                    value={formatNumberWithUnit(deaths, 'persons')}
                    valueClassName={deaths > 0 ? 'text-red-700' : 'text-muted-foreground'}
                />
            )}

            {typeof disabilities === 'number' && (
                <Stat
                    label='Disabilities'
                    value={formatNumberWithUnit(disabilities, 'persons')}
                    valueClassName={disabilities > 0 ? 'text-orange-700' : 'text-muted-foreground'}
                />
            )}

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
                    {formatNumbersNextTotal(totalNextOnNotice, totalOnNotice)}
                </span>
            </div>

            {onNoticeOpen && (
                <>
                    <div id={onNoticeId} className='pl-3 text-[10px] text-muted-foreground mb-0.5'>
                        next month · (pipeline)
                    </div>
                    <Stat
                        label='Voluntary'
                        value={formatNumbersNextTotal(voluntaryNext, voluntaryTotal)}
                        valueClassName={voluntaryTotal > 0 ? 'text-amber-600' : 'text-muted-foreground'}
                        indent
                    />
                    <Stat
                        label='Fired'
                        value={formatNumbersNextTotal(firedNext, firedTotal)}
                        valueClassName={firedTotal > 0 ? 'text-red-500' : 'text-muted-foreground'}
                        indent
                    />
                    <Stat
                        label='Retired'
                        value={formatNumbersNextTotal(retiredNext, retiredTotal)}
                        valueClassName={retiredTotal > 0 ? 'text-blue-600' : 'text-muted-foreground'}
                        indent
                    />
                </>
            )}

            <Rule />

            <div className='flex items-baseline justify-between gap-2'>
                <span className='text-muted-foreground'>Age / Tenure (XP)</span>
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

export function EducationLevelCards({
    summary,
    allocatedWorkers,
    unusedWorkers,
    overqualified,
    deaths,
    disabilities,
}: EducationLevelCardsProps): React.ReactElement {
    const totalActive = summary.totalActive;
    const totalOnboarding = summary.totalOnboarding;
    const totalFired = summary.totalFired;
    const totalVol = summary.totalVoluntary;
    const totalUnused = unusedWorkers ? sumByEdu(unusedWorkers) : 0;
    const totalOverqualified = overqualified?.byEdu ? sumByEdu(overqualified.byEdu) : 0;
    const totalRetired = sumByEdu(summary.retiredByEdu);
    const totalNextRetired = sumByEdu(summary.nextMonthRetiredByEdu);

    return (
        <div className='flex flex-wrap gap-3'>
            {educationLevelKeys.map((edu) => (
                <EducationCard
                    key={edu}
                    header={{ label: eduLabel(edu), badgeClassName: EDU_COLORS[edu].badge }}
                    headcount={{
                        target: allocatedWorkers[edu] ?? 0,
                        active: summary.activeByEdu[edu],
                        unused: unusedWorkers?.[edu] ?? 0,
                    }}
                    overqualified={{
                        count: overqualified?.byEdu?.[edu] ?? 0,
                        breakdown: overqualified?.breakdown?.[edu],
                    }}
                    onNotice={{
                        voluntaryNext: summary.nextMonthVoluntaryByEdu[edu],
                        voluntaryTotal: summary.voluntaryByEdu[edu],
                        firedNext: summary.nextMonthFiredByEdu[edu],
                        firedTotal: summary.firedByEdu[edu],
                        retiredNext: summary.nextMonthRetiredByEdu[edu],
                        retiredTotal: summary.retiredByEdu[edu],
                    }}
                    onboarding={{
                        current: summary.onboardingByEdu[edu],
                        nextMonth: summary.nextMonthOnboardingByEdu[edu],
                    }}
                    demographicEvents={{
                        deaths: deaths?.thisMonth?.[edu],
                        disabilities: disabilities?.thisMonth?.[edu],
                    }}
                    productivity={{
                        meanAge: summary.meanAgeByEdu[edu],
                        ageProd: summary.ageProductivityByEdu[edu],
                        meanTenure: summary.meanTenureByEdu[edu],
                        tenureProd: summary.tenureProductivityByEdu[edu],
                        hasWorkers: summary.activeByEdu[edu] > 0,
                    }}
                />
            ))}

            <EducationCard
                header={{
                    label: 'Total',
                    badgeClassName: 'border-foreground/30 bg-muted text-foreground font-semibold',
                }}
                headcount={{
                    target: sumByEdu(allocatedWorkers),
                    active: totalActive,
                    unused: totalUnused,
                }}
                overqualified={{ count: totalOverqualified }}
                onNotice={{
                    voluntaryNext: sumByEdu(summary.nextMonthVoluntaryByEdu),
                    voluntaryTotal: totalVol,
                    firedNext: sumByEdu(summary.nextMonthFiredByEdu),
                    firedTotal: totalFired,
                    retiredNext: totalNextRetired,
                    retiredTotal: totalRetired,
                }}
                onboarding={{
                    current: totalOnboarding,
                    nextMonth: sumByEdu(summary.nextMonthOnboardingByEdu),
                }}
                productivity={{
                    meanAge: summary.overallMeanAge,
                    ageProd: summary.overallAgeProductivity,
                    meanTenure: summary.overallMeanTenure,
                    tenureProd: summary.overallTenureProductivity,
                    hasWorkers: totalActive > 0,
                }}
                isTotal
            />
        </div>
    );
}
