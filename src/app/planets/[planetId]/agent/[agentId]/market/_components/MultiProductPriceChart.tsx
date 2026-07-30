'use client';

import { GranularityButtonGroup, useGranularity, type Granularity } from '@/components/client/GranularityButtonGroup';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const CHART_COLORS = [
    '#e6194b',
    '#3cb44b',
    '#ffe119',
    '#4363d8',
    '#f58231',
    '#911eb4',
    '#42d4f4',
    '#f032e6',
    '#bfef45',
    '#fabed4',
    '#469990',
    '#dcbeff',
    '#9a6324',
    '#fffac8',
    '#800000',
    '#aaffc3',
    '#808000',
    '#ffd8b1',
    '#000075',
    '#a9a9a9',
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#96CEB4',
    '#FFEAA7',
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

type Row = { bucket: number; avgPrice: number; priceFloor: number };

type MergedPoint = {
    bucket: number;
    yearLabel?: string;
} & Record<string, number | null>;

type Props = {
    planetId: string;
    allResourceNames: string[];
};

function ProductSelector({
    allResourceNames,
    selected,
    onChange,
}: {
    allResourceNames: string[];
    selected: string[];
    onChange: (names: string[]) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filtered = useMemo(
        () => allResourceNames.filter((n) => n.toLowerCase().includes(search.toLowerCase())),
        [allResourceNames, search],
    );

    const toggle = (name: string) => {
        if (selected.includes(name)) {
            onChange(selected.filter((s) => s !== name));
        } else {
            onChange([...selected, name]);
        }
    };

    return (
        <div className='relative'>
            <div className='flex flex-wrap gap-1.5 items-center'>
                {selected.map((name) => (
                    <Badge
                        key={name}
                        variant='secondary'
                        className='cursor-pointer text-[11px] px-2 py-0.5'
                        onClick={() => toggle(name)}
                    >
                        {name} ✕
                    </Badge>
                ))}
                <button
                    onClick={() => setOpen(!open)}
                    className='text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border/40 hover:border-border transition-colors'
                >
                    {selected.length === 0 ? '+ Select products' : '+ Add'}
                </button>
            </div>
            {open && (
                <>
                    <div className='fixed inset-0 z-40' onClick={() => setOpen(false)} />
                    <div className='absolute left-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg p-2 min-w-[220px] max-w-[280px] max-h-[300px] overflow-y-auto'>
                        <Input
                            placeholder='Search…'
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className='h-7 text-xs mb-2'
                            autoFocus
                        />
                        {filtered.length === 0 && (
                            <p className='text-xs text-muted-foreground py-2 text-center'>No products found</p>
                        )}
                        {filtered.map((name) => {
                            const idx = selected.indexOf(name);
                            const color = idx >= 0 ? CHART_COLORS[idx % CHART_COLORS.length] : undefined;
                            return (
                                <label
                                    key={name}
                                    className='flex items-center gap-2 px-1 py-1 hover:bg-muted/60 rounded cursor-pointer text-xs'
                                >
                                    <input
                                        type='checkbox'
                                        checked={idx >= 0}
                                        onChange={() => toggle(name)}
                                        className='accent-primary'
                                    />
                                    {color && (
                                        <span
                                            className='w-2.5 h-2.5 rounded-sm shrink-0'
                                            style={{ backgroundColor: color }}
                                        />
                                    )}
                                    <span className='truncate'>{name}</span>
                                </label>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

function yDomainFor(points: MergedPoint[], productNames: string[]): [number, number] {
    const allValues: number[] = [];
    for (const p of points) {
        for (const name of productNames) {
            const v = p[name];
            if (v !== null && typeof v === 'number' && Number.isFinite(v)) {
                allValues.push(v);
            }
        }
    }
    if (allValues.length === 0) {
        return [0, 1];
    }
    const lo = Math.min(...allValues);
    const hi = Math.max(...allValues);
    const mid = (lo + hi) / 2;
    const minSpread = Math.abs(mid) * 0.02 + 0.01;
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < minSpread) {
        const v = Number.isFinite(mid) ? mid : 0;
        return [v - minSpread / 2, v + minSpread / 2];
    }
    const pad = (hi - lo) * 0.08;
    return [lo - pad, hi + pad];
}

function logTicksFor(points: MergedPoint[], productNames: string[]): number[] | undefined {
    const allValues: number[] = [];
    for (const p of points) {
        for (const name of productNames) {
            const v = p[name];
            if (v !== null && typeof v === 'number' && v > 0) {
                allValues.push(v);
            }
        }
    }
    if (allValues.length === 0) {
        return undefined;
    }
    const minP = Math.min(...allValues);
    const maxP = Math.max(...allValues);
    if (minP === maxP) {
        const e = Math.floor(Math.log10(minP));
        const lower = Math.pow(10, e);
        const upper = Math.pow(10, e + 1);
        return lower === upper ? [lower] : [lower, upper];
    }
    const result: number[] = [];
    for (let e = Math.floor(Math.log10(minP)); e <= Math.ceil(Math.log10(maxP)); e++) {
        result.push(Math.pow(10, e));
    }
    return result;
}

function usesLogScale(points: MergedPoint[], productNames: string[]): boolean {
    const allValues: number[] = [];
    for (const p of points) {
        for (const name of productNames) {
            const v = p[name];
            if (v !== null && typeof v === 'number' && v > 0) {
                allValues.push(v);
            }
        }
    }
    if (allValues.length < 2) {
        return false;
    }
    const lo = Math.min(...allValues);
    const hi = Math.max(...allValues);
    return lo > 0 && hi / lo >= 10;
}

type QueryResult = { productName: string; history: Row[]; isLoading: boolean };

function ProductQuerySlot({
    planetId,
    productName,
    granularity,
    onResult,
}: {
    planetId: string;
    productName: string;
    granularity: Granularity;
    onResult: (name: string, history: Row[], isLoading: boolean) => void;
}): null {
    const trpc = useTRPC();
    const limit = granularity === 'monthly' ? 13 : granularity === 'yearly' ? 11 : 100;
    const query = useSimulationQuery(
        trpc.simulation.getProductPriceHistory.queryOptions({
            planetId,
            productName,
            granularity,
            limit,
        }),
    );

    const prevDataRef = useRef<Row[] | undefined>(undefined);
    useEffect(() => {
        const history = (query.data?.history ?? []).map((r) => ({
            bucket: r.bucket,
            avgPrice: r.avgPrice,
            priceFloor: r.priceFloor,
        }));
        if (history !== prevDataRef.current) {
            prevDataRef.current = history;
            onResult(productName, history, query.isLoading);
        }
    }, [query.data, query.isLoading, productName, onResult]);

    return null;
}

function useQueryResults() {
    const resultsRef = useRef<Map<string, QueryResult>>(new Map());
    const [version, setVersion] = useState(0);

    const onResult = useCallback((name: string, history: Row[], isLoading: boolean) => {
        const prev = resultsRef.current.get(name);
        if (
            prev &&
            prev.isLoading === isLoading &&
            prev.history.length === history.length &&
            prev.history.every((r, i) => r.bucket === history[i]?.bucket && r.avgPrice === history[i]?.avgPrice)
        ) {
            return;
        }
        resultsRef.current.set(name, { productName: name, history, isLoading });
        setVersion((n) => n + 1);
    }, []);

    const clear = useCallback(() => {
        resultsRef.current.clear();
        setVersion((n) => n + 1);
    }, []);

    return { resultsRef, onResult, clear, version };
}

export default function MultiProductPriceChart({ planetId, allResourceNames }: Props): React.ReactElement {
    const { granularity, setGranularity, currentTick } = useGranularity();

    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [rescaleMode, setRescaleMode] = useState<'absolute' | 'relative'>('absolute');
    const { resultsRef, onResult, clear, version } = useQueryResults();

    // Clear results when granularity changes (different data shape)
    useEffect(() => {
        clear();
    }, [granularity, clear]);

    const results: QueryResult[] = useMemo(() => {
        const arr: QueryResult[] = [];
        for (const name of selectedProducts) {
            const r = resultsRef.current.get(name);
            if (r) {
                arr.push(r);
            }
        }
        return arr;
    }, [selectedProducts, version]);

    const isLoading = results.length < selectedProducts.length || results.some((r) => r.isLoading);

    const mergedData: MergedPoint[] = useMemo(() => {
        const allBuckets = new Map<number, MergedPoint>();
        const bucketToYearLabel = new Map<number, string>();

        for (const { productName, history } of results) {
            for (const row of history) {
                const bucket = row.bucket;
                if (!allBuckets.has(bucket)) {
                    allBuckets.set(bucket, { bucket });
                }
                const point = allBuckets.get(bucket)!;
                point[productName] =
                    rescaleMode === 'relative' && row.priceFloor > 0 ? row.avgPrice / row.priceFloor : row.avgPrice;

                if (!bucketToYearLabel.has(bucket)) {
                    const tick = bucket;
                    if (granularity === 'monthly') {
                        const totalMonths = Math.floor(tick / 30);
                        const year = Math.floor(totalMonths / 12);
                        const monthIdx = totalMonths % 12;
                        bucketToYearLabel.set(bucket, `${MONTH_NAMES[monthIdx] ?? ''} ${year}`);
                    } else if (granularity === 'yearly') {
                        const year = Math.floor(tick / 360);
                        bucketToYearLabel.set(bucket, `Y${year}`);
                    } else {
                        const year = Math.floor(tick / 360);
                        bucketToYearLabel.set(bucket, `Y${year}`);
                    }
                }
            }
        }

        for (const name of selectedProducts) {
            for (const [, point] of allBuckets) {
                if (point[name] === undefined) {
                    point[name] = null;
                }
            }
        }

        const sorted = Array.from(allBuckets.values()).sort((a, b) => a.bucket - b.bucket);
        for (const p of sorted) {
            p.yearLabel = bucketToYearLabel.get(p.bucket);
        }
        return sorted;
    }, [results, selectedProducts, granularity, rescaleMode]);

    const scale = useMemo(() => {
        if (mergedData.length === 0) {
            return 'linear' as const;
        }
        return usesLogScale(mergedData, selectedProducts) ? ('log' as const) : ('linear' as const);
    }, [mergedData, selectedProducts]);

    const yTicks = useMemo(() => {
        if (scale === 'log') {
            return logTicksFor(mergedData, selectedProducts);
        }
        return undefined;
    }, [mergedData, selectedProducts, scale]);

    const yDomain = useMemo(() => {
        if (scale === 'log' && yTicks) {
            return [Math.min(...yTicks), Math.max(...yTicks)] as [number, number];
        }
        return yDomainFor(mergedData, selectedProducts);
    }, [mergedData, selectedProducts, scale, yTicks]);

    const xTickFormatter = (bucket: number) => {
        if (granularity === 'monthly') {
            const totalMonths = Math.floor(bucket / 30);
            const monthIdx = totalMonths % 12;
            return MONTH_NAMES[monthIdx] ?? '';
        }
        return `Y${Math.floor(bucket / 360)}`;
    };

    const tooltipLabelFormatter = (bucket: number) => {
        const pt = mergedData.find((p) => p.bucket === bucket);
        return pt?.yearLabel ?? String(bucket);
    };

    const xTicks = useMemo(() => {
        if (mergedData.length <= 6) {
            return mergedData.map((p) => p.bucket);
        }
        const step = Math.max(1, Math.floor(mergedData.length / 6));
        return mergedData.filter((_, i) => i % step === 0).map((p) => p.bucket);
    }, [mergedData]);

    const xDomain: [number, number] =
        mergedData.length >= 2 ? [mergedData[0].bucket, mergedData[mergedData.length - 1].bucket] : [0, 1];

    const yTickFormatter = (v: number) =>
        rescaleMode === 'relative' ? `${v.toFixed(1)}×` : formatNumberWithUnit(v, 'currency', planetId);

    return (
        <div>
            <Separator className='my-4' />
            <div className='flex flex-col gap-3'>
                <div className='text-sm font-semibold flex items-center justify-between flex-wrap gap-2'>
                    <span>Price Comparison</span>
                    <div className='flex items-center gap-2'>
                        <Tabs value={rescaleMode} onValueChange={(v) => setRescaleMode(v as 'absolute' | 'relative')}>
                            <TabsList className='h-6 p-0'>
                                <TabsTrigger
                                    value='absolute'
                                    className='text-xs px-2 bg-muted/50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                                >
                                    Price
                                </TabsTrigger>
                                <TabsTrigger
                                    value='relative'
                                    className='text-xs px-2 bg-muted/50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                                >
                                    Price/Cost
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                        <GranularityButtonGroup
                            granularity={granularity}
                            onChange={setGranularity}
                            currentTick={currentTick}
                        />
                    </div>
                </div>

                <ProductSelector
                    allResourceNames={allResourceNames}
                    selected={selectedProducts}
                    onChange={setSelectedProducts}
                />

                {selectedProducts.map((name) => (
                    <ProductQuerySlot
                        key={name}
                        planetId={planetId}
                        productName={name}
                        granularity={granularity}
                        onResult={onResult}
                    />
                ))}

                {selectedProducts.length === 0 ? (
                    <div className='h-[240px] flex items-center justify-center text-sm text-muted-foreground'>
                        Select products above to compare price trends
                    </div>
                ) : (
                    <div
                        className={`h-[300px] ${isLoading ? 'opacity-40 animate-pulse pointer-events-none select-none' : ''}`}
                    >
                        <ResponsiveContainer width='100%' height='100%'>
                            <LineChart data={mergedData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                                <CartesianGrid stroke='#334155' strokeOpacity={0.5} />
                                <XAxis
                                    dataKey='bucket'
                                    type='number'
                                    domain={xDomain}
                                    ticks={xTicks.length > 1 ? xTicks : undefined}
                                    tickFormatter={xTickFormatter}
                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                    axisLine={{ stroke: '#334155' }}
                                    tickLine={false}
                                    minTickGap={36}
                                />
                                <YAxis
                                    type='number'
                                    scale={scale}
                                    domain={yDomain}
                                    allowDataOverflow
                                    ticks={yTicks}
                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={52}
                                    tickFormatter={yTickFormatter}
                                />
                                <Tooltip
                                    content={({ active, payload, label }) => {
                                        if (!active || !payload || payload.length === 0) {
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
                                                {payload.map((p) => (
                                                    <div key={p.name} style={{ color: p.color ?? '#e2e8f0' }}>
                                                        {p.name}:{' '}
                                                        {rescaleMode === 'relative'
                                                            ? `${(p.value as number).toFixed(2)}×`
                                                            : formatNumberWithUnit(
                                                                  p.value as number,
                                                                  'currency',
                                                                  planetId,
                                                              )}
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    }}
                                />
                                <Legend
                                    verticalAlign='bottom'
                                    content={({ payload }) => {
                                        if (!payload || payload.length === 0) {
                                            return null;
                                        }
                                        return (
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'center',
                                                    gap: 12,
                                                    padding: 0,
                                                    flexWrap: 'wrap',
                                                }}
                                            >
                                                {payload.map((entry) => (
                                                    <div
                                                        key={entry.value}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 4,
                                                            fontSize: 11,
                                                            color: '#94a3b8',
                                                        }}
                                                    >
                                                        <svg width={16} height={10} viewBox='0 0 16 10'>
                                                            <line
                                                                x1={0}
                                                                y1={5}
                                                                x2={16}
                                                                y2={5}
                                                                stroke={entry.color}
                                                                strokeWidth={2}
                                                            />
                                                        </svg>
                                                        <span>{entry.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    }}
                                />
                                {selectedProducts.map((name, idx) => (
                                    <Line
                                        key={name}
                                        type='monotone'
                                        dataKey={name}
                                        stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                                        strokeWidth={2}
                                        dot={{ r: 2.5, fill: CHART_COLORS[idx % CHART_COLORS.length] }}
                                        activeDot={{ r: 3, stroke: '#1e293b', strokeWidth: 2 }}
                                        isAnimationActive={false}
                                        connectNulls={false}
                                        name={name}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </div>
    );
}
