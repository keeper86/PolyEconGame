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
    bucketDecadeMid,
    computeExpensesRevenueBuckets,
    formatDecadeLabel,
    formatYearLabel,
    splitNetIncome,
    type FinancialChartPoint,
    type FinancialLive,
    type FinancialPoint,
    type Granularity,
} from './financialChartLogic';
import { useLocale, useTranslations } from 'next-intl';

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
    const yDomain = (vals: number[]): [number, number] | ['auto', 'auto'] => {
        const finite = vals.filter(Number.isFinite);
        if (finite.length === 0) {
            return ['auto', 'auto'];
        }
        const lo = Math.min(0, ...finite);
        const hi = Math.max(0, ...finite);
        if (lo === hi) {
            return [lo * 0.9 - 0.001, hi * 1.1 + 0.001];
        }
        const pad = (hi - lo) * 0.08;
        return [Math.max(0, lo - pad), hi + pad];
    };

    const liveX = live && live.tick > 0 ? liveYearX(live.tick) : null;

    const { scale, domain, yTicks } = useMemo(() => {
        const allVals = [...data, ...(ghostData ?? [])].flatMap((p) => [
            p.avgMonthlyNetIncome,
            p.avgWages,
            p.sumPurchases,
            p.sumClaimPayments,
            p.sumInterestPaid + p.sumWealthTaxPaid,
            Math.abs(netIncomeOf(p)),
        ]);
        const positive = allVals.filter((v) => v > 0);

        if (live && live.tick > 0) {
            allVals.push(
                live.avgMonthlyNetIncome,
                live.avgWages,
                live.sumPurchases,
                live.sumClaimPayments,
                live.sumInterestPaid + live.sumWealthTaxPaid,
                Math.abs(
                    computeNetIncome({
                        revenue: live.avgMonthlyNetIncome,
                        wages: live.avgWages,
                        purchases: live.sumPurchases,
                        claimPayments: live.sumClaimPayments,
                        interestPaid: live.sumInterestPaid,
                        wealthTaxPaid: live.sumWealthTaxPaid,
                    }),
                ),
            );
        }

        if (positive.length >= 2) {
            const lo = Math.min(...positive);
            const hi = Math.max(...positive);
            if (hi / lo > 10) {
                const loExp = Math.floor(Math.log10(lo));
                const hiExp = Math.ceil(Math.log10(hi));
                const ticks: number[] = [];
                for (let e = loExp; e <= hiExp; e++) {
                    ticks.push(Math.pow(10, e));
                }
                const logDomain: [number, number] = [Math.pow(10, loExp), Math.pow(10, hiExp)];
                return { scale: 'symlog' as const, domain: logDomain, yTicks: ticks };
            }
        }
        return { scale: 'linear' as const, domain: yDomain(allVals), yTicks: undefined };
    }, [data, ghostData, live]);

    const chartData = useMemo(() => {
        if (granularity === 'monthly') {
            const currentPts = data as FinancialChartPoint[];
            const ghostPts = ghostData ?? [];
            const currentByMonthIdx = new Map(currentPts.map((p) => [p.monthIdx, p]));
            const ghostByMonthIdx = new Map(ghostPts.map((p) => [p.monthIdx, p]));
            const allIdxs = new Set([...currentByMonthIdx.keys(), ...ghostByMonthIdx.keys()]);
            return Array.from(allIdxs)
                .sort((a, b) => {
                    const aIsCurrent = currentByMonthIdx.has(a);
                    const bIsCurrent = currentByMonthIdx.has(b);
                    if (aIsCurrent === bIsCurrent) {
                        return a - b;
                    }
                    return aIsCurrent ? -1 : 1;
                })
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
                    <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                        <defs>
                            <linearGradient id='gradRevenue' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#06b6d4' stopOpacity={0.45} />
                                <stop offset='95%' stopColor='#06b6d4' stopOpacity={0.08} />
                            </linearGradient>
                            <linearGradient id='gradWages' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#3b82f6' stopOpacity={0.5} />
                                <stop offset='95%' stopColor='#3b82f6' stopOpacity={0.1} />
                            </linearGradient>
                            <linearGradient id='gradPurchases' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#f59e0b' stopOpacity={0.5} />
                                <stop offset='95%' stopColor='#f59e0b' stopOpacity={0.1} />
                            </linearGradient>
                            <linearGradient id='gradClaims' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#8b5cf6' stopOpacity={0.5} />
                                <stop offset='95%' stopColor='#8b5cf6' stopOpacity={0.1} />
                            </linearGradient>
                            <linearGradient id='gradMisc' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#ec4899' stopOpacity={0.5} />
                                <stop offset='95%' stopColor='#ec4899' stopOpacity={0.1} />
                            </linearGradient>
                            <linearGradient id='gradIncome' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#10b981' stopOpacity={0.45} />
                                <stop offset='95%' stopColor='#10b981' stopOpacity={0.08} />
                            </linearGradient>
                            <linearGradient id='gradLoss' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#f43f5e' stopOpacity={0.45} />
                                <stop offset='95%' stopColor='#f43f5e' stopOpacity={0.08} />
                            </linearGradient>
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
                        <Area
                            type='monotone'
                            stackId='expenses'
                            dataKey='wages'
                            name={t('wages')}
                            stroke='#3b82f6'
                            strokeWidth={1.5}
                            fill='url(#gradWages)'
                            dot={{ r: 2.5, fill: '#3b82f6' }}
                            activeDot={{ r: 3 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            stackId='expenses'
                            dataKey='purchases'
                            name={t('purchases')}
                            stroke='#f59e0b'
                            strokeWidth={1.5}
                            fill='url(#gradPurchases)'
                            dot={{ r: 2.5, fill: '#f59e0b' }}
                            activeDot={{ r: 3 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            stackId='expenses'
                            dataKey='claimPayments'
                            name={t('claims')}
                            stroke='#8b5cf6'
                            strokeWidth={1.5}
                            fill='url(#gradClaims)'
                            dot={{ r: 2.5, fill: '#8b5cf6' }}
                            activeDot={{ r: 3 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            stackId='expenses'
                            dataKey='misc'
                            name={t('interestAndTax')}
                            stroke='#ec4899'
                            strokeWidth={1.5}
                            fill='url(#gradMisc)'
                            dot={{ r: 2.5, fill: '#ec4899' }}
                            activeDot={{ r: 3 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='revenue'
                            name={t('revenue')}
                            stroke='#06b6d4'
                            strokeWidth={2}
                            fill='url(#gradRevenue)'
                            dot={{ r: 3, fill: '#06b6d4' }}
                            activeDot={{ r: 3, fill: '#06b6d4' }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='income'
                            name={t('income')}
                            stroke='#10b981'
                            strokeWidth={2}
                            fill='url(#gradIncome)'
                            dot={{ r: 2.5, fill: '#10b981' }}
                            activeDot={{ r: 3, fill: '#10b981' }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='loss'
                            name={t('loss')}
                            stroke='#f43f5e'
                            strokeWidth={2}
                            fill='url(#gradLoss)'
                            dot={{ r: 2.5, fill: '#f43f5e' }}
                            activeDot={{ r: 3, fill: '#f43f5e' }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            stackId='expensesGhost'
                            dataKey='ghostWages'
                            stroke='#3b82f6'
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={{ r: 2, fill: '#3b82f6', fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            stackId='expensesGhost'
                            dataKey='ghostPurchases'
                            stroke='#f59e0b'
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={{ r: 2, fill: '#f59e0b', fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            stackId='expensesGhost'
                            dataKey='ghostClaimPayments'
                            stroke='#8b5cf6'
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={{ r: 2, fill: '#8b5cf6', fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            stackId='expensesGhost'
                            dataKey='ghostMisc'
                            stroke='#ec4899'
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={{ r: 2, fill: '#ec4899', fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
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
                            dot={{ r: 2, fill: '#10b981', fillOpacity: 0.4, stroke: 'none' }}
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
                            dot={{ r: 2, fill: '#f43f5e', fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
