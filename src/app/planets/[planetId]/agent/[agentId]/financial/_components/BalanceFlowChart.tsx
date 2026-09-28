'use client';

import { tickToDate } from '@/components/client/TickDisplay';
import { liveYearX } from '@/lib/chartTime';
import {
    DECADE_WINDOW,
    YEAR_WINDOW,
    blendLive,
    bucketProgress,
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
import {
    Area,
    AreaChart,
    CartesianGrid,
    Legend,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { FinancialTooltip } from './FinancialTooltip';
import {
    MONTHLY_GRID_VALUES,
    MONTHLY_X_TICKS,
    alignedYDomains,
    bucketDecadeMid,
    bucketYearMid,
    formatDecadeLabel,
    formatYearLabel,
    type FinancialChartPoint,
    type FinancialLive,
    type FinancialPoint,
    type Granularity,
} from './financialChartLogic';
import { useLocale, useTranslations } from 'next-intl';

export function BalanceFlowChart({
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
    const liveRow = useMemo(() => {
        if (!live || live.tick <= 0) {
            return null;
        }
        return {
            xVal: liveYearX(live.tick),
            year: tickToDate(live.tick).year,
            cashBalance: live.avgNetBalance,
            assetValue: live.avgAssetValue,
            netPosition: live.avgNetBalance + live.avgAssetValue,
            netIncome: computeNetIncome({
                revenue: live.avgMonthlyNetIncome,
                wages: live.avgWages,
                purchases: live.sumPurchases,
                claimPayments: live.sumClaimPayments,
                interestPaid: live.sumInterestPaid,
                wealthTaxPaid: live.sumWealthTaxPaid,
            }),
            ghostCashBalance: null,
            ghostAssetValue: null,
            ghostNetPosition: null,
            ghostNetIncome: null,
        };
    }, [live]);

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
                    const netIncome = curr
                        ? computeNetIncome({
                              revenue: curr.avgMonthlyNetIncome,
                              wages: curr.avgWages,
                              purchases: curr.sumPurchases,
                              claimPayments: curr.sumClaimPayments,
                              interestPaid: curr.sumInterestPaid,
                              wealthTaxPaid: curr.sumWealthTaxPaid,
                          })
                        : null;
                    const ghostNetIncome = ghost
                        ? computeNetIncome({
                              revenue: ghost.avgMonthlyNetIncome,
                              wages: ghost.avgWages,
                              purchases: ghost.sumPurchases,
                              claimPayments: ghost.sumClaimPayments,
                              interestPaid: ghost.sumInterestPaid,
                              wealthTaxPaid: ghost.sumWealthTaxPaid,
                          })
                        : null;
                    return {
                        monthIdx,
                        year,
                        cashBalance: curr?.avgNetBalance ?? null,
                        assetValue: curr?.avgAssetValue ?? null,
                        netPosition:
                            curr?.avgNetBalance != null && curr?.avgAssetValue != null
                                ? curr.avgNetBalance + curr.avgAssetValue
                                : null,
                        netIncome: netIncome,
                        ghostCashBalance: ghost?.avgNetBalance ?? null,
                        ghostAssetValue: ghost?.avgAssetValue ?? null,
                        ghostNetPosition:
                            ghost?.avgNetBalance != null && ghost?.avgAssetValue != null
                                ? ghost.avgNetBalance + ghost.avgAssetValue
                                : null,
                        ghostNetIncome: ghostNetIncome,
                    };
                });
        }
        const monthsPerBucket = granularity === 'decade' ? 120 : granularity === 'yearly' ? 12 : 1;
        const rows = [...(data as FinancialPoint[])]
            .sort((a, b) => a.bucket - b.bucket)
            .map((p) => {
                const { monthIndex } = tickToDate(p.bucket);
                const xVal = granularity === 'decade' ? bucketDecadeMid(p.bucket) : bucketYearMid(p.bucket);
                return {
                    xVal,
                    year: xVal,
                    monthIndex,
                    cashBalance: p.avgNetBalance,
                    assetValue: p.avgAssetValue,
                    netPosition: p.avgNetBalance + p.avgAssetValue,
                    netIncome: computeNetIncome({
                        revenue: p.avgMonthlyNetIncome,
                        wages: p.avgWages,
                        purchases: p.sumPurchases / monthsPerBucket,
                        claimPayments: p.sumClaimPayments / monthsPerBucket,
                        interestPaid: p.sumInterestPaid / monthsPerBucket,
                        wealthTaxPaid: p.sumWealthTaxPaid / monthsPerBucket,
                    }),
                    ghostCashBalance: null,
                    ghostAssetValue: null,
                    ghostNetPosition: null,
                    ghostNetIncome: null,
                };
            });
        if (!liveRow || !live) {
            return rows;
        }
        const previous = rows[rows.length - 1];
        const progress = bucketProgress(live.tick, granularity);
        return [
            ...rows,
            {
                ...liveRow,
                cashBalance: blendLive(previous?.cashBalance, liveRow.cashBalance, progress),
                assetValue: blendLive(previous?.assetValue, liveRow.assetValue, progress),
                netPosition: blendLive(previous?.netPosition, liveRow.netPosition, progress),
                netIncome: blendLive(previous?.netIncome, liveRow.netIncome, progress),
            },
        ];
    }, [data, ghostData, granularity, live, liveRow]);

    const [domainBalance, domainIncome] = useMemo(() => {
        const balanceVals = chartData
            .flatMap((p) => [p.cashBalance ?? p.ghostCashBalance, p.netPosition ?? p.ghostNetPosition])
            .filter((v): v is number => v !== null);
        const incomeVals = chartData.map((p) => p.netIncome ?? p.ghostNetIncome).filter((v): v is number => v !== null);
        return alignedYDomains(balanceVals, incomeVals);
    }, [chartData]);

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
                liveRow?.xVal,
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
            liveRow?.xVal ?? lastDecadeX,
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
    }, [granularity, data, liveRow, locale]);

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
            <p className='text-xs font-semibold text-muted-foreground mb-2'>{t('balanceFlowTitle')}</p>
            <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    <AreaChart data={chartData} margin={{ top: 0, right: -20, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id='gradCashBalance2' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#4f46e5' stopOpacity={0.45} />
                                <stop offset='95%' stopColor='#4f46e5' stopOpacity={0.08} />
                            </linearGradient>
                            <linearGradient id='gradNetPosition2' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#10b981' stopOpacity={0.4} />
                                <stop offset='95%' stopColor='#10b981' stopOpacity={0.06} />
                            </linearGradient>
                            <linearGradient id='gradIncome2' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#06b6d4' stopOpacity={0.45} />
                                <stop offset='95%' stopColor='#06b6d4' stopOpacity={0.08} />
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
                            yAxisId='left'
                            type='number'
                            domain={domainBalance}
                            tick={{ fontSize: 10, fill: '#4f46e5' }}
                            axisLine={false}
                            tickLine={false}
                            width={56}
                            tickFormatter={(v) => formatNumberWithUnit(v as number, 'currency', undefined, locale)}
                        />
                        <YAxis
                            yAxisId='right'
                            orientation='right'
                            type='number'
                            domain={domainIncome}
                            tick={{ fontSize: 10, fill: '#06b6d4' }}
                            axisLine={false}
                            tickLine={false}
                            width={56}
                            tickFormatter={(v) => formatNumberWithUnit(v as number, 'currency', undefined, locale)}
                        />
                        <Tooltip content={<FinancialTooltip labelFormatter={tooltipLabelFormatter} />} />
                        <ReferenceLine
                            yAxisId='left'
                            y={0}
                            stroke='#94a3b8'
                            strokeOpacity={0.5}
                            strokeDasharray='3 3'
                        />
                        <ReferenceLine yAxisId='right' y={0} stroke='#94a3b8' strokeOpacity={0} />
                        <Legend wrapperStyle={{ fontSize: 10, color: '#e2e8f0' }} />
                        <Area
                            yAxisId='left'
                            type='monotone'
                            dataKey='cashBalance'
                            name={t('cashBalance')}
                            stroke='#4f46e5'
                            strokeWidth={2}
                            fill='url(#gradCashBalance2)'
                            dot={{ r: 2.5, fill: '#4f46e5' }}
                            activeDot={{ r: 3, fill: '#4f46e5', stroke: '#1e293b', strokeWidth: 2 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            yAxisId='left'
                            type='monotone'
                            dataKey='netPosition'
                            name={t('netPosition')}
                            stroke='#10b981'
                            strokeWidth={2}
                            fill='url(#gradNetPosition2)'
                            dot={{ r: 2.5, fill: '#10b981' }}
                            activeDot={{ r: 3, fill: '#10b981', stroke: '#1e293b', strokeWidth: 2 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            yAxisId='right'
                            type='monotone'
                            dataKey='netIncome'
                            name={t('netIncome')}
                            stroke='#06b6d4'
                            strokeWidth={2}
                            fill='url(#gradIncome2)'
                            dot={{ r: 2.5, fill: '#06b6d4' }}
                            activeDot={{ r: 3, fill: '#06b6d4', stroke: '#1e293b', strokeWidth: 2 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            yAxisId='left'
                            type='monotone'
                            dataKey='ghostCashBalance'
                            stroke='#4f46e5'
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={{ r: 2, fill: '#4f46e5', fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            yAxisId='left'
                            type='monotone'
                            dataKey='ghostNetPosition'
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
                            yAxisId='right'
                            type='monotone'
                            dataKey='ghostNetIncome'
                            stroke='#06b6d4'
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={{ r: 2, fill: '#06b6d4', fillOpacity: 0.4, stroke: 'none' }}
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
