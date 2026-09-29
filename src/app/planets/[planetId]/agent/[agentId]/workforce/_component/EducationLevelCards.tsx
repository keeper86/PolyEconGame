'use client';

import { Stat } from '@/components/client/Stat';
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { eduLabel, EDU_COLORS, sumByEdu, CHART_COLORS } from './workforceTheme';
import type { EducationLevelType } from '@/simulation/population/education';
import { educationLevelKeys } from '@/simulation/population/education';
import { formatNumberWithUnit } from '@/lib/utils';
import type { WorkforceSummary } from './workforceSummary';
import type { DemographicEventCounters } from '@/simulation/planet/planet';
import { useLocale, useTranslations } from 'next-intl';

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
    const locale = useLocale();
    const tr = useTranslations('Workforce');
    const formatNumbersNextTotal = (next: number, total: number): string =>
        `${formatNumberWithUnit(next, 'persons', undefined, locale)}  (${formatNumberWithUnit(total, 'persons', undefined, locale)})`;
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
                label={tr('target')}
                value={
                    <>
                        {formatNumberWithUnit(target, 'persons', undefined, locale)}
                        {overqualifiedCount && overqualifiedCount > 0 ? (
                            <Tooltip>
                                <TooltipTrigger>
                                    <span className='text-amber-600 ml-1 tabular-nums'>
                                        ({formatNumberWithUnit(overqualifiedCount, 'persons', undefined, locale)})
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={6}>
                                    <div className='max-w-xs'>
                                        <div className='font-medium'>{tr('overqualified')}</div>
                                        <div className='text-xs text-muted-foreground mt-1'>
                                            {tr('overqualifiedNote', { count: overqualifiedCount })}
                                        </div>
                                        {overqualifiedBreakdown && (
                                            <div className='mt-2 text-xs'>
                                                {Object.entries(overqualifiedBreakdown)
                                                    .filter(([, v]) => v && v > 0)
                                                    .map(([wEdu, count]) => (
                                                        <div key={wEdu} className='text-amber-600'>
                                                            {eduLabel(tr, wEdu as EducationLevelType)} ×{count}
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
                label={tr('currentTotalLabel')}
                value={formatNumberWithUnit(totalWorkforce, 'persons', undefined, locale)}
                valueClassName='text-foreground'
                bold
            />
            <Stat
                label={unused < 0 ? tr('workerShortage') : tr('unusedWorker')}
                value={`${formatNumberWithUnit(Math.abs(unused), 'persons', undefined, locale)}`}
                valueClassName={unused > 0 ? 'text-green-600' : unused < 0 ? 'text-red-500' : 'text-muted-foreground'}
            />

            <Rule />

            <Stat label={tr('activeLabel')} value={formatNumberWithUnit(active, 'persons', undefined, locale)} />

            <div className='flex items-baseline justify-between gap-2'>
                <button
                    type='button'
                    onClick={() => setOnboardingOpen((s) => !s)}
                    aria-expanded={onboardingOpen}
                    aria-controls={onboardingId}
                    className='flex items-center gap-2 text-left'
                >
                    <span className='truncate text-muted-foreground'>{tr('onboarding')}</span>
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
                    {formatNumberWithUnit(onboardingCurrent, 'persons', undefined, locale)}
                </span>
            </div>

            {onboardingOpen && (
                <>
                    <div id={onboardingId} className='pl-3 text-[10px] text-muted-foreground mb-0.5'>
                        {tr('nextMonth')}
                    </div>
                    <Stat
                        label={tr('completing')}
                        value={formatNumberWithUnit(onboardingNext, 'persons', undefined, locale)}
                        valueClassName={onboardingNext > 0 ? 'text-violet-600' : 'text-muted-foreground'}
                        indent
                    />
                </>
            )}

            {typeof deaths === 'number' && (
                <Stat
                    label={tr('deaths')}
                    value={formatNumberWithUnit(deaths, 'persons', undefined, locale)}
                    valueClassName={deaths > 0 ? 'text-red-700' : 'text-muted-foreground'}
                />
            )}

            {typeof disabilities === 'number' && (
                <Stat
                    label={tr('disabilities')}
                    value={formatNumberWithUnit(disabilities, 'persons', undefined, locale)}
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
                    <span className='truncate text-muted-foreground'>{tr('onNotice')}</span>
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
                        {tr('nextMonthPipeline')}
                    </div>
                    <Stat
                        label={tr('voluntary')}
                        value={formatNumbersNextTotal(voluntaryNext, voluntaryTotal)}
                        valueClassName={voluntaryTotal > 0 ? 'text-amber-600' : 'text-muted-foreground'}
                        indent
                    />
                    <Stat
                        label={tr('fired')}
                        value={formatNumbersNextTotal(firedNext, firedTotal)}
                        valueClassName={firedTotal > 0 ? 'text-red-500' : 'text-muted-foreground'}
                        indent
                    />
                    <Stat
                        label={tr('retired')}
                        value={formatNumbersNextTotal(retiredNext, retiredTotal)}
                        valueClassName={retiredTotal > 0 ? 'text-blue-600' : 'text-muted-foreground'}
                        indent
                    />
                </>
            )}

            <Rule />

            <div className='flex items-baseline justify-between gap-2'>
                <span className='text-muted-foreground'>{tr('ageTenure')}</span>
                <span className='tabular-nums font-medium'>
                    {hasWorkers ? `${meanAge.toFixed(1)}` : '—'}
                    <span className='text-muted-foreground mx-0.5'>/</span>
                    {hasWorkers ? `${meanTenure.toFixed(1)}y` : '—'}
                </span>
            </div>
            <div className='flex items-baseline justify-between gap-2'>
                <span className='text-muted-foreground'>{tr('productivity')}</span>
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
    const tr = useTranslations('Workforce');
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
                    header={{ label: eduLabel(tr, edu), badgeClassName: EDU_COLORS[edu].badge }}
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
                    label: tr('total'),
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
