'use client';

import { tickToDate } from '@/components/client/TickDisplay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { initialMarketPrices } from '@/simulation/initialUniverse/initialMarketPrices';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';
import React, { useMemo } from 'react';
import { Area, AreaChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Bucket sizes in ticks for each granularity.
const BUCKET_TICKS = { monthly: 30, yearly: 360, decade: 3600 } as const;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

type ChartPoint = {
    tick: number;
    year: number;
    monthIdx?: number;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
};

type Props = {
    planetId: string;
    productName: string;
    /** Live price stats from the already-fetched market data (current tick). */
    live?: {
        tick: number;
        /** Current tick's clearing price (used as fallback). */
        price: number;
        /** Running intra-month average price (may be undefined if no trades yet). */
        avgPrice?: number;
        minPrice?: number;
        maxPrice?: number;
    };
};

function yDomainFor(points: ChartPoint[]): [number, number] {
    if (points.length === 0) {
        return [0, 1];
    }
    const mins = points.map((d) => d.minPrice);
    const maxs = points.map((d) => d.maxPrice);
    const lo = Math.min(...mins);
    const hi = Math.max(...maxs);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
        const v = Number.isFinite(lo) ? lo : 0;
        return [v * 0.95 - 0.0001, v * 1.05 + 0.0001];
    }
    const pad = (hi - lo) * 0.08;
    return [lo - pad, hi + pad];
}

function logTicksFor(points: ChartPoint[]): number[] | undefined {
    const prices = points.map((d) => d.avgPrice).filter((v) => v > 0);
    if (prices.length === 0) {
        return undefined;
    }
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    if (minP === maxP) {
        return [minP];
    }
    const result: number[] = [];
    for (let e = Math.floor(Math.log10(minP)); e <= Math.ceil(Math.log10(maxP)); e++) {
        result.push(Math.pow(10, e));
    }
    return result;
}

type MergedPoint = {
    monthIdx?: number;
    year: number;
    tick: number;
    avgPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    ghostAvgPrice: number | null;
    ghostMinPrice: number | null;
    ghostMaxPrice: number | null;
};

function PriceAreaChart({
    data,
    ghostData,
    gradId,
    xDataKey = 'year',
    xDomain,
    xTicks,
    xTickFormatter,
    tooltipLabelFormatter,
    tooltipFormatter,
    scale,
    yDomain,
    yTicks,
    yAxisOrientation = 'left',
    showLegend: _showLegend,
    label,
    referenceYBand,
}: {
    data: ChartPoint[];
    ghostData?: ChartPoint[];
    gradId: string;
    xDataKey?: 'year' | 'monthIdx';
    xDomain?: [number | string, number | string];
    xTicks?: number[];
    xTickFormatter: (v: number) => string;
    tooltipLabelFormatter: (v: number) => string;
    tooltipFormatter: (v: number, name: string) => [string, string];
    scale: 'log' | 'linear';
    yDomain: [number, number] | ['auto', 'auto'];
    yTicks?: number[];
    yAxisOrientation?: 'left' | 'right' | 'none';
    showLegend: boolean;
    label: string;
    /** Optional shaded band to draw (e.g. to show where the sibling chart's range sits). */
    referenceYBand?: { y1: number; y2: number };
}) {
    const mergedData: MergedPoint[] = useMemo(() => {
        if (!ghostData || ghostData.length === 0) {
            return data.map((p) => ({
                ...p,
                avgPrice: p.avgPrice,
                minPrice: p.minPrice,
                maxPrice: p.maxPrice,
                ghostAvgPrice: null,
                ghostMinPrice: null,
                ghostMaxPrice: null,
            }));
        }
        const ghostByMonth = new Map(ghostData.filter((p) => p.monthIdx !== undefined).map((p) => [p.monthIdx!, p]));
        const currentByMonth = new Map(data.filter((p) => p.monthIdx !== undefined).map((p) => [p.monthIdx!, p]));
        const allIdxs = new Set([...currentByMonth.keys(), ...ghostByMonth.keys()]);
        return Array.from(allIdxs)
            .sort((a, b) => {
                // Current-data entries (including the live fractional point) must come first
                // so that ghost-only integer entries (e.g. Oct=9 from last year) are never
                // interleaved between current entries, which would insert avgPrice:null gaps
                // and break the amber line before the live fractional point (e.g. 9.47).
                const aIsCurrent = currentByMonth.has(a);
                const bIsCurrent = currentByMonth.has(b);
                if (aIsCurrent === bIsCurrent) {
                    return a - b;
                }
                return aIsCurrent ? -1 : 1;
            })
            .map((monthIdx) => {
                const curr = currentByMonth.get(monthIdx);
                const ghost = ghostByMonth.get(monthIdx);
                return {
                    monthIdx,
                    tick: curr?.tick ?? ghost?.tick ?? 0,
                    year: curr?.year ?? ghost?.year ?? 0,
                    avgPrice: curr?.avgPrice ?? null,
                    minPrice: curr?.minPrice ?? null,
                    maxPrice: curr?.maxPrice ?? null,
                    ghostAvgPrice: ghost?.avgPrice ?? null,
                    ghostMinPrice: ghost?.minPrice ?? null,
                    ghostMaxPrice: ghost?.maxPrice ?? null,
                };
            });
    }, [data, ghostData]);

    const hasGhost = ghostData && ghostData.length > 0;
    const chartData = hasGhost ? mergedData : data;
    return (
        <div className='flex flex-col' style={{ width: '50%', height: 200 }}>
            <div className='text-center text-[10px] text-slate-500 mb-0.5'>{label}</div>
            <div style={{ flex: 1 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id={gradId} x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#38bdf8' stopOpacity={0.45} />
                                <stop offset='95%' stopColor='#38bdf8' stopOpacity={0.08} />
                            </linearGradient>
                        </defs>
                        <XAxis
                            dataKey={xDataKey}
                            type='number'
                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                            axisLine={{ stroke: '#334155' }}
                            tickLine={false}
                            domain={xDomain ?? ['dataMin', 'dataMax']}
                            ticks={xTicks}
                            tickFormatter={xTickFormatter}
                            minTickGap={xTicks ? 0 : 36}
                        />
                        {yAxisOrientation !== 'none' && (
                            <YAxis
                                orientation={yAxisOrientation}
                                type='number'
                                scale={scale}
                                domain={yDomain}
                                allowDataOverflow
                                ticks={yTicks}
                                tick={{ fontSize: 10, fill: '#94a3b8' }}
                                axisLine={false}
                                tickLine={false}
                                width={52}
                                tickFormatter={(v) => (typeof v === 'number' ? formatNumbers(v) : String(v))}
                            />
                        )}
                        <Tooltip
                            content={({ active, payload, label }) => {
                                if (!active || !payload || payload.length === 0) {
                                    return null;
                                }
                                const filtered = payload.filter((p) => !String(p.name).startsWith('ghost'));
                                if (filtered.length === 0) {
                                    return null;
                                }
                                return (
                                    <div
                                        style={{
                                            background: '#1e293b',
                                            border: '1px solid #334155',
                                            borderRadius: '6px',
                                            fontSize: 12,
                                            padding: '6px 10px',
                                        }}
                                    >
                                        <div style={{ color: '#94a3b8', marginBottom: 4 }}>
                                            {tooltipLabelFormatter(label as number)}
                                        </div>
                                        {filtered.map((p) => {
                                            const [val, name] = tooltipFormatter(p.value as number, p.name as string);
                                            return (
                                                <div key={p.name} style={{ color: '#e2e8f0' }}>
                                                    {name}: {val}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            }}
                        />
                        {referenceYBand && (
                            <ReferenceArea
                                y1={referenceYBand.y1}
                                y2={referenceYBand.y2}
                                fill='#f59e0b'
                                fillOpacity={0.07}
                                stroke='#f59e0b'
                                strokeOpacity={0.35}
                                strokeDasharray='3 3'
                                strokeWidth={1}
                                ifOverflow='hidden'
                            />
                        )}
                        <Area
                            type='monotone'
                            dataKey='maxPrice'
                            stroke='#38bdf8'
                            strokeWidth={1}
                            strokeDasharray='3 3'
                            fill={`url(#${gradId})`}
                            dot={false}
                            activeDot={false}
                            name='maxPrice'
                        />
                        <Area
                            type='monotone'
                            dataKey='minPrice'
                            stroke='#38bdf8'
                            strokeWidth={1}
                            strokeDasharray='3 3'
                            fill='var(--background, #0f172a)'
                            dot={false}
                            activeDot={false}
                            name='minPrice'
                        />
                        <Area
                            type='monotone'
                            dataKey='avgPrice'
                            stroke='#f59e0b'
                            strokeWidth={2}
                            fill='none'
                            dot={false}
                            activeDot={{ r: 3, fill: '#f59e0b', stroke: '#1e293b', strokeWidth: 2 }}
                            name='avgPrice'
                            connectNulls={false}
                        />
                        {hasGhost && (
                            <Area
                                type='monotone'
                                dataKey='ghostAvgPrice'
                                stroke='#f59e0b'
                                strokeWidth={2}
                                strokeOpacity={0.35}
                                fill='none'
                                dot={false}
                                activeDot={false}
                                name='ghostAvgPrice'
                                connectNulls={false}
                            />
                        )}
                        {hasGhost && (
                            <Area
                                type='monotone'
                                dataKey='ghostMaxPrice'
                                stroke='#38bdf8'
                                strokeWidth={1}
                                strokeOpacity={0.3}
                                strokeDasharray='3 3'
                                fill='none'
                                dot={false}
                                activeDot={false}
                                name='ghostMaxPrice'
                                connectNulls={false}
                            />
                        )}
                        {hasGhost && (
                            <Area
                                type='monotone'
                                dataKey='ghostMinPrice'
                                stroke='#38bdf8'
                                strokeWidth={1}
                                strokeOpacity={0.3}
                                strokeDasharray='3 3'
                                fill='none'
                                dot={false}
                                activeDot={false}
                                name='ghostMinPrice'
                                connectNulls={false}
                            />
                        )}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

export default function ProductPriceHistoryChart({ planetId, productName, live }: Props): React.ReactElement {
    const trpc = useTRPC();

    const { data: monthly, isLoading: loadingMonthly } = useSimulationQuery(
        trpc.simulation.getProductPriceHistory.queryOptions({
            planetId,
            productName,
            granularity: 'monthly',
            limit: 13,
        }),
    );
    const { data: yearly, isLoading: loadingYearly } = useSimulationQuery(
        trpc.simulation.getProductPriceHistory.queryOptions({ planetId, productName, granularity: 'yearly', limit: 9 }),
    );
    const { data: decade, isLoading: loadingDecade } = useSimulationQuery(
        trpc.simulation.getProductPriceHistory.queryOptions({ planetId, productName, granularity: 'decade' }),
    );

    const isLoading = loadingMonthly || loadingYearly || loadingDecade;

    type RawPoint = { bucket: number; avgPrice: number; minPrice: number; maxPrice: number };

    const toPoints = (history: typeof monthly): RawPoint[] =>
        (history?.history ?? []).map((r) => ({
            bucket: r.bucket,
            avgPrice: r.avgPrice,
            minPrice: r.minPrice,
            maxPrice: r.maxPrice,
        }));

    // --- Monthly chart data (right panel) ---
    // Always pinned to [Jan=0 … Dec=11] of the most recent year in the data.
    const monthlyData = useMemo((): ChartPoint[] => {
        const pts = toPoints(monthly).sort((a, b) => a.bucket - b.bucket);

        // Determine the most-recent year present in the data (or from live tick).
        // live.tick is a 1-indexed game tick; bucket values need +1 to align with tickToDate.
        const latestYear = live
            ? tickToDate(live.tick).year
            : pts.length > 0
              ? tickToDate(pts[pts.length - 1].bucket + 1).year
              : 0;

        // Bucket timestamps represent the END of the month. Shift monthIdx by +1 so that
        // January data (end of Jan) appears at x=1, February at x=2, …, December at x=12.
        // Position x=0 is the anchor: end-of-December from the previous year.
        //
        // TimescaleDB time_bucket() returns 0-indexed bucket starts, but tickToDate expects
        // 1-indexed game ticks (it subtracts 1 internally). Use bucket+1 to align correctly.
        const result: ChartPoint[] = pts
            .filter((p) => tickToDate(p.bucket + 1).year === latestYear)
            .map((p) => {
                const { monthIndex } = tickToDate(p.bucket + 1);
                return {
                    tick: p.bucket,
                    year: p.bucket / TICKS_PER_YEAR,
                    monthIdx: monthIndex + 1,
                    avgPrice: p.avgPrice,
                    minPrice: p.minPrice,
                    maxPrice: p.maxPrice,
                };
            });

        // Add anchor point at x=0: December of the previous year.
        const prevDecPoint = pts.find((p) => {
            const { year, monthIndex } = tickToDate(p.bucket + 1);
            return year === latestYear - 1 && monthIndex === 11;
        });
        if (prevDecPoint) {
            result.unshift({
                tick: prevDecPoint.bucket,
                year: prevDecPoint.bucket / TICKS_PER_YEAR,
                monthIdx: 0,
                avgPrice: prevDecPoint.avgPrice,
                minPrice: prevDecPoint.minPrice,
                maxPrice: prevDecPoint.maxPrice,
            });
        } else {
            // First year: no previous December — fall back to the initial market price.
            const fallbackPrice = initialMarketPrices[productName] ?? 1;
            result.unshift({
                tick: 0,
                year: latestYear - 1,
                monthIdx: 0,
                avgPrice: fallbackPrice,
                minPrice: fallbackPrice,
                maxPrice: fallbackPrice,
            });
        }

        if (live) {
            const { year: liveYear, monthIndex: liveMonthIdx, day: liveDay } = tickToDate(live.tick);
            if (liveYear === latestYear) {
                const fractionalMonthIdx = liveMonthIdx + (liveDay - 1) / TICKS_PER_MONTH;
                const liveAvg = live.avgPrice ?? live.price;
                const liveMin = live.minPrice ?? live.price;
                const liveMax = live.maxPrice ?? live.price;

                // Blend with the last completed month's values for the first BLEND_TICKS ticks
                // of the month to smooth the hard transition when avg/min/max collapse.
                const BLEND_TICKS = 10;
                const tickInMonth = liveDay; // 0-indexed
                const prevPoint = result.length > 0 ? result[result.length - 1] : null;
                let blendedAvg = liveAvg;
                let blendedMin = liveMin;
                let blendedMax = liveMax;
                if (prevPoint && tickInMonth < BLEND_TICKS) {
                    const newWeight = tickInMonth / BLEND_TICKS;
                    const oldWeight = 1 - newWeight;
                    blendedAvg = oldWeight * prevPoint.avgPrice + newWeight * liveAvg;
                    blendedMin = oldWeight * prevPoint.minPrice + newWeight * liveMin;
                    blendedMax = oldWeight * prevPoint.maxPrice + newWeight * liveMax;
                }

                result.push({
                    tick: live.tick,
                    year: live.tick / TICKS_PER_YEAR,
                    monthIdx: fractionalMonthIdx,
                    avgPrice: blendedAvg,
                    minPrice: blendedMin,
                    maxPrice: blendedMax,
                });
            }
        }
        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [monthly, live]);

    // --- History chart data (left panel): decade + yearly, excluding ticks covered by monthly ---
    const historyData = useMemo((): ChartPoint[] => {
        const monthlyMinTick = monthlyData.length > 0 ? monthlyData[0].tick : Infinity;

        const decadePoints = toPoints(decade);
        const yearlyPoints = toPoints(yearly);

        // Yearly data takes priority over decades; keep all yearly points before monthly range
        const filteredYearly = yearlyPoints.filter((p) => p.bucket < monthlyMinTick);

        // Drop decade buckets that fall within a decade-period already covered by yearly data
        const coveredByYearly = new Set(filteredYearly.map((p) => Math.floor(p.bucket / BUCKET_TICKS.decade)));
        const filteredDecade = decadePoints.filter(
            (p) => p.bucket < monthlyMinTick && !coveredByYearly.has(Math.floor(p.bucket / BUCKET_TICKS.decade)),
        );

        return [...filteredDecade, ...filteredYearly]
            .sort((a, b) => a.bucket - b.bucket)
            .map((p) => ({
                tick: p.bucket,
                year: p.bucket / TICKS_PER_YEAR,
                avgPrice: p.avgPrice,
                minPrice: p.minPrice,
                maxPrice: p.maxPrice,
            }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [decade, yearly, monthlyData]);

    // --- Ghost monthly data: previous year's months not yet reached in current year ---
    const ghostMonthlyData = useMemo((): ChartPoint[] => {
        const pts = toPoints(monthly).sort((a, b) => a.bucket - b.bucket);
        const currentMonthIdx = live
            ? tickToDate(live.tick).monthIndex
            : monthlyData.length > 0
              ? (monthlyData[monthlyData.length - 1].monthIdx ?? -1)
              : -1;
        const latestYear = live
            ? tickToDate(live.tick).year
            : monthlyData.length > 0
              ? tickToDate(monthlyData[monthlyData.length - 1].tick + 1).year
              : 0;

        const result = pts.filter((p) => {
            const { year, monthIndex } = tickToDate(p.bucket + 1);
            return year === latestYear - 1 && monthIndex >= currentMonthIdx;
        });

        return result.map((p) => {
            const { monthIndex } = tickToDate(p.bucket + 1);
            return {
                tick: p.bucket,
                year: p.bucket / TICKS_PER_YEAR,
                // Ghost data also uses the +1 shift to overlay on the same axis.
                monthIdx: monthIndex + 1,
                avgPrice: p.avgPrice,
                minPrice: p.minPrice,
                maxPrice: p.maxPrice,
            };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [monthly, monthlyData, live]);

    // Separate Y-axis domains: history uses the full combined range; monthly uses only its own data
    const allData = useMemo(() => [...historyData, ...monthlyData], [historyData, monthlyData]);
    const historyYDomain = useMemo(() => yDomainFor(historyData), [historyData]);
    const monthlyYDomain = useMemo(
        () => yDomainFor([...monthlyData, ...ghostMonthlyData]),
        [monthlyData, ghostMonthlyData],
    );

    // Reference band on the history chart showing where the monthly range sits
    const monthlyRefBand = useMemo((): { y1: number; y2: number } | undefined => {
        if (monthlyData.length === 0 || historyData.length === 0) {
            return undefined;
        }
        return { y1: monthlyYDomain[0], y2: monthlyYDomain[1] };
    }, [monthlyYDomain, monthlyData.length, historyData.length]);

    // Use log scale when the combined price range spans an order of magnitude
    const allAvgPrices = useMemo(() => allData.map((d) => d.avgPrice).filter((v) => v > 0), [allData]);
    const useLogForHistory = useMemo(() => {
        if (allAvgPrices.length < 2) {
            return false;
        }
        const lo = Math.min(...allAvgPrices);
        const hi = Math.max(...allAvgPrices);
        return lo > 0 && hi / lo >= 10;
    }, [allAvgPrices]);

    const historyGradId = `grad_hist_${productName.replace(/\s+/g, '_')}`;
    const monthlyGradId = `grad_mon_${productName.replace(/\s+/g, '_')}`;

    const tooltipFormatter = (value: number, name: string): [string, string] => {
        const labels: Record<string, string> = { avgPrice: 'Avg price', minPrice: 'Min price', maxPrice: 'Max price' };
        return [formatNumbers(value), labels[name] ?? name];
    };

    const formatYearTick = (year: number): string => {
        if (typeof year !== 'number') {
            return String(year);
        }
        return Number.isInteger(year) ? `Y${year}` : `Y${year.toFixed(0)}`;
    };

    // monthIdx 0 = end of previous December (anchor); 1–12 = Jan–Dec of current year.
    const formatMonthTick = (monthIdx: number): string => MONTH_NAMES[(monthIdx + 11) % 12] ?? '';

    const yearTooltipLabel = (year: number): string => {
        if (typeof year !== 'number') {
            return String(year);
        }
        return `Y${year.toFixed(1)}`;
    };

    const monthTooltipLabel = (monthIdx: number): string => {
        // monthIdx is 1-12 (shifted); 0 is the previous-December anchor.
        // Reconstruct the display year from monthlyData.
        // pt.tick stores the raw bucket value (0-indexed), so use bucket+1 for tickToDate.
        const pt = monthlyData.find((p) => p.monthIdx === monthIdx);
        const { year: yearInt } = pt ? tickToDate(pt.tick + 1) : { year: 0 };
        const label = MONTH_NAMES[(monthIdx + 11) % 12] ?? '';
        return `${label} Y${yearInt}`;
    };

    if (isLoading) {
        return <div className='text-xs text-muted-foreground'>Loading price history…</div>;
    }

    const hasHistory = historyData.length > 0;
    const hasMonthly = monthlyData.length > 0;

    return (
        <div className='space-y-1'>
            <div className='flex w-full' style={{ height: 200 }}>
                {hasHistory && (
                    <PriceAreaChart
                        data={historyData}
                        gradId={historyGradId}
                        xTickFormatter={formatYearTick}
                        tooltipLabelFormatter={yearTooltipLabel}
                        tooltipFormatter={tooltipFormatter}
                        scale={useLogForHistory ? 'log' : 'linear'}
                        yDomain={useLogForHistory ? ['auto', 'auto'] : historyYDomain}
                        yTicks={useLogForHistory ? logTicksFor(historyData) : undefined}
                        showLegend={!hasMonthly}
                        label='Years / Decades'
                        referenceYBand={useLogForHistory ? undefined : monthlyRefBand}
                    />
                )}
                {hasHistory && hasMonthly && <div className='w-px bg-slate-700 self-stretch mx-0.5 mt-5' />}
                {hasMonthly && (
                    <PriceAreaChart
                        data={monthlyData}
                        ghostData={ghostMonthlyData}
                        gradId={monthlyGradId}
                        xDataKey='monthIdx'
                        xDomain={[0, 12]}
                        xTicks={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}
                        xTickFormatter={formatMonthTick}
                        tooltipLabelFormatter={monthTooltipLabel}
                        tooltipFormatter={tooltipFormatter}
                        scale='linear'
                        yDomain={monthlyYDomain}
                        yAxisOrientation={!hasHistory ? 'left' : 'right'}
                        showLegend={true}
                        label='Monthly'
                    />
                )}
            </div>
        </div>
    );
}
