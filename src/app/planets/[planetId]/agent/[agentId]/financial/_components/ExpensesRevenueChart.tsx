'use client';

import { tickToDate } from '@/components/client/TickDisplay';
import { liveYearX } from '@/lib/chartTime';
import {
    DECADE_WINDOW,
    YEAR_WINDOW,
    decadeStart,
    decadeWindowAxis,
    formatMonthLabel,
    monthShortName,
    yearStart,
    yearWindowAxis,
} from '@/lib/historyChartAxis';
import { formatNumberWithUnit } from '@/lib/utils';
import { computeNetIncome } from '@/simulation/financial/netIncome';
import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FinancialTooltip } from './FinancialTooltip';
import {
    MONTHLY_GRID_VALUES,
    MONTHLY_X_TICKS,
    EXPENSE_SERIES_KEYS,
    EPSILON,
    bucketDecadeMid,
    computeExpensesRevenueBuckets,
    applySeriesFloors,
    expenseLinearDomain,
    expenseMagnitudeOrder,
    expenseResolutionMagnitudes,
    formatDecadeLabel,
    formatYearLabel,
    splitNetIncome,
    type ExpenseSeriesKey,
    type FinancialChartPoint,
    type FinancialLive,
    type FinancialPoint,
    type Granularity,
} from './financialChartLogic';
import { useLocale, useTranslations } from 'next-intl';

const EXPENSE_LABEL: Record<ExpenseSeriesKey, 'wages' | 'purchases' | 'claims' | 'interestAndTax'> = {
    wages: 'wages',
    purchases: 'purchases',
    claimPayments: 'claims',
    misc: 'interestAndTax',
};

const EXPENSE_COLOUR: Record<ExpenseSeriesKey, string> = {
    wages: '#3b82f6',
    purchases: '#f59e0b',
    claimPayments: '#8b5cf6',
    misc: '#ec4899',
};

const EXPENSE_FILL_TOP_OPACITY = 0.75;
const EXPENSE_FILL_BOTTOM_OPACITY = 0.22;

const netIncomeOf = (p: FinancialPoint): number =>
    computeNetIncome({
        revenue: p.avgMonthlyNetIncome,
        wages: p.avgWages,
        purchases: p.sumPurchases,
        claimPayments: p.sumClaimPayments,
        interestPaid: p.sumInterestPaid,
        wealthTaxPaid: p.sumWealthTaxPaid,
    });

export function ExpensesRevenueChart({
    data,
    ghostData,
    granularity,
    live,
}: {
    data: FinancialChartPoint[] | FinancialPoint[];
    ghostData?: FinancialChartPoint[];
    granularity: Granularity;
    live?: FinancialLive;
}) {
    const locale = useLocale();
    const t = useTranslations('Financial');

    const liveX = live && live.tick > 0 ? liveYearX(live.tick) : null;

    const chartData = useMemo(() => {
        if (granularity === 'monthly') {
            const currentPts = data as FinancialChartPoint[];
            const ghostPts = ghostData ?? [];
            const currentByMonthIdx = new Map(currentPts.map((p) => [p.monthIdx, p]));
            const ghostByMonthIdx = new Map(ghostPts.map((p) => [p.monthIdx, p]));
            const allIdxs = new Set([...currentByMonthIdx.keys(), ...ghostByMonthIdx.keys()]);
            return Array.from(allIdxs)
                .sort((a, b) => a - b)
                .map((monthIdx) => {
                    const curr = currentByMonthIdx.get(monthIdx);
                    const ghost = ghostByMonthIdx.get(monthIdx);
                    const year = curr ? tickToDate(curr.bucket).year : ghost ? tickToDate(ghost.bucket).year : 0;
                    const currProfit = curr ? splitNetIncome(netIncomeOf(curr)) : { income: null, loss: null };
                    const ghostProfit = ghost ? splitNetIncome(netIncomeOf(ghost)) : { income: null, loss: null };
                    return {
                        monthIdx,
                        year,
                        revenue: curr ? curr.avgMonthlyNetIncome : null,
                        wages: curr?.avgWages ?? null,
                        purchases: curr?.sumPurchases ?? null,
                        claimPayments: curr?.sumClaimPayments ?? null,
                        misc: curr ? curr.sumInterestPaid + curr.sumWealthTaxPaid : null,
                        income: currProfit.income,
                        loss: currProfit.loss,
                        ghostRevenue: ghost ? ghost.avgMonthlyNetIncome : null,
                        ghostWages: ghost?.avgWages ?? null,
                        ghostPurchases: ghost?.sumPurchases ?? null,
                        ghostClaimPayments: ghost?.sumClaimPayments ?? null,
                        ghostMisc: ghost ? ghost.sumInterestPaid + ghost.sumWealthTaxPaid : null,
                        ghostIncome: ghostProfit.income,
                        ghostLoss: ghostProfit.loss,
                    };
                });
        }
        return computeExpensesRevenueBuckets(data as FinancialPoint[], granularity, live);
    }, [data, ghostData, granularity, live]);

    const { scale, domain, yTicks } = useMemo(() => {
        const positive = expenseResolutionMagnitudes(chartData);

        if (positive.length >= 2) {
            const sorted = [...positive].sort((a, b) => a - b);

            const min = sorted[0];
            const max = sorted[sorted.length - 1];

            const candidateLo = sorted[2];
            const candidateHi = sorted[sorted.length - 3];

            // Trim only if the resulting domain has a non-zero range.
            const canTrim = candidateLo !== undefined && candidateHi !== undefined && candidateLo < candidateHi;

            const lo = canTrim ? candidateLo : min;
            const hi = canTrim ? candidateHi : max;

            if (hi / lo > 10) {
                const loExp = Math.floor(Math.log10(lo));
                const hiExp = Math.ceil(Math.log10(hi));
                const logTicks: number[] = [];
                for (let e = loExp; e <= hiExp; e++) {
                    logTicks.push(Math.pow(10, e));
                }
                const logDomain: [number, number] = [Math.pow(10, loExp), Math.pow(10, hiExp)];
                return { scale: 'symlog' as const, domain: logDomain, yTicks: logTicks };
            }
        }
        return { scale: 'linear' as const, domain: expenseLinearDomain(positive), yTicks: undefined };
    }, [chartData]);

    const renderData = useMemo(() => applySeriesFloors(chartData, EPSILON, EPSILON), [chartData]);

    const expenseKeys = useMemo(
        () => (scale === 'symlog' ? expenseMagnitudeOrder(chartData) : [...EXPENSE_SERIES_KEYS]),
        [scale, chartData],
    );

    const xAxisProps = useMemo(() => {
        if (granularity === 'monthly') {
            return {
                dataKey: 'monthIdx' as const,
                type: 'number' as const,
                domain: [0, 12] as [number, number],
                ticks: MONTHLY_X_TICKS,
                tickFormatter: (v: number) => monthShortName(locale, (Math.ceil(v) + 11) % 12),
                gridVertical: true,
                gridValues: MONTHLY_GRID_VALUES,
            };
        }
        if (granularity === 'yearly') {
            const yearlyPts = (data as FinancialPoint[]).slice(-YEAR_WINDOW);
            const axis = yearWindowAxis(
                yearlyPts.length > 0 ? yearStart(yearlyPts[0].bucket) : undefined,
                liveX ?? undefined,
            );
            return {
                dataKey: 'xVal' as const,
                type: 'number' as const,
                domain: axis.domain,
                ticks: axis.ticks,
                tickFormatter: axis.tickFormatter,
                gridVertical: true,
                gridValues: axis.gridValues,
            };
        }
        const decadePts = (data as FinancialPoint[]).slice(-DECADE_WINDOW);
        const lastDecadeX = decadePts.length > 0 ? bucketDecadeMid(decadePts[decadePts.length - 1].bucket) : undefined;
        const decade = decadeWindowAxis(
            decadePts.length > 0 ? decadeStart(decadePts[0].bucket) : undefined,
            liveX ?? lastDecadeX,
        );
        return {
            dataKey: 'xVal' as const,
            type: 'number' as const,
            domain: decade.domain,
            ticks: decade.ticks,
            tickFormatter: decade.tickFormatter,
            gridVertical: true,
            gridValues: decade.gridValues,
        };
    }, [granularity, data, liveX, locale]);

    const tooltipLabelFormatter = useMemo(() => {
        if (granularity === 'monthly') {
            const byMonthIdx = new Map(
                chartData
                    .filter((p): p is { monthIdx: number; year: number } & typeof p => 'monthIdx' in p)
                    .map((p) => [p.monthIdx, formatMonthLabel(locale, p.monthIdx, p.year)]),
            );
            return (label: number) => byMonthIdx.get(label) ?? '';
        }
        return granularity === 'decade'
            ? (v: number) => formatDecadeLabel(locale, v)
            : (v: number) => formatYearLabel(locale, v);
    }, [granularity, chartData, locale]);

    return (
        <div className='flex flex-col items-start gap-1'>
            <p className='text-xs font-semibold text-muted-foreground mb-2'>{t('expensesRevenueTitle')}</p>
            <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    <AreaChart data={renderData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                        <defs>
                            <linearGradient id='gradRevenue' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#06b6d4' stopOpacity={0.45} />
                                <stop offset='95%' stopColor='#06b6d4' stopOpacity={0.08} />
                            </linearGradient>
                            {EXPENSE_SERIES_KEYS.map((key) => (
                                <linearGradient key={key} id={`grad-${key}`} x1='0' x2='0' y1='0' y2='1'>
                                    <stop
                                        offset='5%'
                                        stopColor={EXPENSE_COLOUR[key]}
                                        stopOpacity={EXPENSE_FILL_TOP_OPACITY}
                                    />
                                    <stop
                                        offset='95%'
                                        stopColor={EXPENSE_COLOUR[key]}
                                        stopOpacity={EXPENSE_FILL_BOTTOM_OPACITY}
                                    />
                                </linearGradient>
                            ))}
                        </defs>
                        <CartesianGrid
                            vertical={xAxisProps.gridVertical}
                            horizontal={false}
                            verticalValues={xAxisProps.gridValues}
                            stroke='#334155'
                            strokeOpacity={xAxisProps.gridVertical ? 0.7 : 1}
                        />
                        <XAxis
                            dataKey={xAxisProps.dataKey}
                            type={xAxisProps.type}
                            domain={xAxisProps.domain}
                            ticks={xAxisProps.ticks}
                            tickFormatter={xAxisProps.tickFormatter}
                            allowDataOverflow={granularity === 'monthly'}
                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                            axisLine={{ stroke: '#334155' }}
                            tickLine={false}
                            minTickGap={xAxisProps.ticks ? 0 : 36}
                        />
                        <YAxis
                            type='number'
                            scale={scale as unknown as 'log' | 'linear'}
                            domain={domain}
                            allowDataOverflow
                            ticks={yTicks}
                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                            axisLine={false}
                            tickLine={false}
                            width={56}
                            tickFormatter={(v) => formatNumberWithUnit(v as number, 'currency', undefined, locale)}
                        />
                        <Tooltip content={<FinancialTooltip labelFormatter={tooltipLabelFormatter} />} />
                        <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />

                        {expenseKeys.map((key) => (
                            <Area
                                key={key}
                                type='monotone'
                                stackId='expenses'
                                dataKey={key}
                                name={t(EXPENSE_LABEL[key])}
                                stroke={EXPENSE_COLOUR[key]}
                                strokeWidth={1.5}
                                fill={`url(#grad-${key})`}
                                dot={false}
                                activeDot={{ r: 3 }}
                                isAnimationActive={false}
                                connectNulls={false}
                            />
                        ))}
                        <Area
                            type='monotone'
                            dataKey='revenue'
                            name={t('revenue')}
                            stroke='#06b6d4'
                            strokeWidth={2}
                            fill='none'
                            dot={{ r: 3, fill: '#06b6d4' }}
                            activeDot={{ r: 3, fill: '#06b6d4' }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        {expenseKeys.map((key) => (
                            <Area
                                key={`ghost-${key}`}
                                type='monotone'
                                stackId='expensesGhost'
                                dataKey={`ghost${key[0].toUpperCase()}${key.slice(1)}`}
                                stroke={EXPENSE_COLOUR[key]}
                                strokeWidth={1}
                                strokeOpacity={0.5}
                                strokeDasharray='4 2'
                                fill='none'
                                dot={false}
                                activeDot={false}
                                legendType='none'
                                isAnimationActive={false}
                                connectNulls={false}
                            />
                        ))}
                        <Area
                            type='monotone'
                            dataKey='ghostRevenue'
                            stroke='#06b6d4'
                            strokeWidth={1.5}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={{ r: 2, fill: '#06b6d4', fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='ghostIncome'
                            stroke='#10b981'
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={false}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='ghostLoss'
                            stroke='#f43f5e'
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={false}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='income'
                            name={t('income')}
                            stroke='#10b981'
                            strokeWidth={5}
                            fill='none'
                            dot={false}
                            activeDot={{ r: 3, fill: '#10b981' }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='loss'
                            name={t('loss')}
                            stroke='#f43f5e'
                            strokeWidth={5}
                            fill='none'
                            dot={false}
                            activeDot={{ r: 3, fill: '#f43f5e' }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
