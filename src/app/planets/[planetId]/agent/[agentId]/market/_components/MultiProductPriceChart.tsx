'use client';

import { GranularityButtonGroup, useGranularity, type Granularity } from '@/components/client/GranularityButtonGroup';
import { ProductIcon } from '@/components/client/ProductIcon';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    beverageResourceType,
    cementResourceType,
    chemicalResourceType,
    clayResourceType,
    clothingResourceType,
    coalResourceType,
    concreteResourceType,
    consumerElectronicsResourceType,
    copperOreResourceType,
    copperResourceType,
    cottonResourceType,
    crudeOilResourceType,
    electronicsResourceType,
    fabricResourceType,
    fuelResourceType,
    furnitureResourceType,
    glassResourceType,
    ironOreResourceType,
    limestoneResourceType,
    logsResourceType,
    lumberResourceType,
    machineryResourceType,
    packagingResourceType,
    paperResourceType,
    pesticideResourceType,
    pharmaceuticalResourceType,
    plasticResourceType,
    processedFoodResourceType,
    produceResourceType,
    sandResourceType,
    siliconWaferResourceType,
    steelResourceType,
    stoneResourceType,
    vehicleResourceType,
    waterResourceType,
} from '@/simulation/planet/resources';
import {
    administrativeServiceResourceType,
    constructionServiceResourceType,
    educationServiceResourceType,
    groceryServiceResourceType,
    healthcareServiceResourceType,
    logisticsServiceResourceType,
    maintenanceServiceResourceType,
    retailServiceResourceType,
} from '@/simulation/planet/services';

const RESOURCE_COLOR_MAP: Record<string, string> = {
    // Iron / Steel / Metal — warm orange
    [ironOreResourceType.name]: '#c97a5e',
    [steelResourceType.name]: '#d48b5e',
    [machineryResourceType.name]: '#dfa05e',
    [vehicleResourceType.name]: '#e8b45e',

    // Water — blue
    [waterResourceType.name]: '#5e8fc9',

    // Food & Drink — green
    [produceResourceType.name]: '#5cb85c',
    [processedFoodResourceType.name]: '#6fc96f',
    [beverageResourceType.name]: '#82d882',

    // Coal — brown
    [coalResourceType.name]: '#8d6e40',

    // Oil / Petrochemicals — yellow-brown to green-gold
    [crudeOilResourceType.name]: '#a08040',
    [fuelResourceType.name]: '#d4b040',
    [plasticResourceType.name]: '#d4c040',
    [chemicalResourceType.name]: '#b4c060',
    [pesticideResourceType.name]: '#9ab860',
    [pharmaceuticalResourceType.name]: '#80b060',

    // Wood / Paper — forest green
    [logsResourceType.name]: '#5a8040',
    [lumberResourceType.name]: '#6a9050',
    [paperResourceType.name]: '#7aa060',
    [furnitureResourceType.name]: '#8ab070',

    // Stone / Construction — warm gray to amber
    [stoneResourceType.name]: '#a09880',
    [sandResourceType.name]: '#b8b098',
    [limestoneResourceType.name]: '#a8a898',
    [clayResourceType.name]: '#c0a88a',
    [cementResourceType.name]: '#b0a088',
    [concreteResourceType.name]: '#a09878',
    [glassResourceType.name]: '#88b0c0',

    // Copper / Electronics — copper to teal
    [copperOreResourceType.name]: '#c08050',
    [copperResourceType.name]: '#d09060',
    [siliconWaferResourceType.name]: '#80b0c0',
    [electronicsResourceType.name]: '#70a0b8',
    [consumerElectronicsResourceType.name]: '#6090a8',

    // Cotton / Textiles — purple
    [cottonResourceType.name]: '#b098d0',
    [fabricResourceType.name]: '#c0a8e0',
    [clothingResourceType.name]: '#d0b8f0',

    // Packaging — pink
    [packagingResourceType.name]: '#e0a8c0',

    // Services — muted blues
    [administrativeServiceResourceType.name]: '#7090a0',
    [logisticsServiceResourceType.name]: '#80a0b0',
    [constructionServiceResourceType.name]: '#90b0c0',
    [groceryServiceResourceType.name]: '#a0c0c0',
    [retailServiceResourceType.name]: '#b0d0d0',
    [healthcareServiceResourceType.name]: '#b0d0c0',
    [educationServiceResourceType.name]: '#c0e0d8',
    [maintenanceServiceResourceType.name]: '#90a090',
};

function resourceColor(name: string): string {
    return RESOURCE_COLOR_MAP[name] ?? '#a0a0a0';
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

type Row = { bucket: number; avgPrice: number; priceFloor: number };

type MergedPoint = {
    bucket: number;
    yearLabel?: string;
} & Record<string, number | null>;

type Props = {
    planetId: string;
    allResourceNames: string[];
    selectorResourceNames?: string[];
};

function ProductToggleButton({
    name,
    isSelected,
    onClick,
}: {
    name: string;
    isSelected: boolean;
    onClick: () => void;
}) {
    const color = resourceColor(name);
    return (
        <button
            type='button'
            aria-pressed={isSelected}
            onClick={onClick}
            className={`
                relative flex flex-col items-center justify-center gap-1 w-[56px] h-[56px] rounded-md
                transition-all duration-150 ease-in-out select-none
                ${
                    isSelected
                        ? 'bg-gradient-to-b from-[#1a1a2e] to-[#141428] translate-y-[1px]'
                        : 'bg-gradient-to-b from-[#2a2a3a] to-[#1a1a2e] hover:from-[#30304a] hover:to-[#22223a]'
                }
            `}
            style={{
                boxShadow: isSelected
                    ? `inset 0 2px 4px rgba(0,0,0,0.6), 0 0 0 2px ${color}`
                    : `2px 3px 6px rgba(0,0,0,0.5), inset 1px 1px 2px rgba(255,255,255,0.08)`,
            }}
        >
            <ProductIcon productName={name} size={36} />
        </button>
    );
}

function ProductSelector({
    allResourceNames,
    selectorResourceNames,
    selected,
    onChange,
}: {
    allResourceNames: string[];
    selectorResourceNames?: string[];
    selected: string[];
    onChange: (names: string[]) => void;
}) {
    const [search, setSearch] = useState('');

    const displayNames = useMemo(
        () =>
            selectorResourceNames
                ? allResourceNames.filter((n) => selectorResourceNames.includes(n))
                : allResourceNames,
        [allResourceNames, selectorResourceNames],
    );

    const filtered = useMemo(
        () => displayNames.filter((n) => n.toLowerCase().includes(search.toLowerCase())),
        [displayNames, search],
    );

    const toggle = (name: string) => {
        if (selected.includes(name)) {
            onChange(selected.filter((s) => s !== name));
        } else {
            onChange([...selected, name]);
        }
    };

    return (
        <div className='space-y-2'>
            <Input
                placeholder='Search products…'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className='h-7 text-xs max-w-[280px]'
            />
            {filtered.length === 0 ? (
                <p className='text-xs text-muted-foreground py-2'>No products found</p>
            ) : (
                <div className='flex flex-wrap gap-2'>
                    {filtered.map((name) => (
                        <ProductToggleButton
                            key={name}
                            name={name}
                            isSelected={selected.includes(name)}
                            onClick={() => toggle(name)}
                        />
                    ))}
                </div>
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

export default function MultiProductPriceChart({
    planetId,
    allResourceNames,
    selectorResourceNames,
}: Props): React.ReactElement {
    const { granularity, setGranularity, currentTick } = useGranularity();

    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [rescaleMode, setRescaleMode] = useState<'absolute' | 'relative'>('absolute');
    const { resultsRef, onResult, clear } = useQueryResults();

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
    }, [selectedProducts, resultsRef]);

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

                <div className='flex flex-row gap-2'>
                    <span className='flex-2'>
                        <ProductSelector
                            allResourceNames={allResourceNames}
                            selectorResourceNames={selectorResourceNames}
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
                    </span>

                    <span className='flex-3'>
                        {selectedProducts.length === 0 ? (
                            <div className='h-[240px] flex items-center justify-center text-sm text-muted-foreground'>
                                Select products to compare price trends
                            </div>
                        ) : (
                            <div
                                className={`h-[480px] ${isLoading ? 'opacity-40 animate-pulse pointer-events-none select-none' : ''}`}
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
                                        {selectedProducts.map((name) => (
                                            <Line
                                                key={name}
                                                type='monotone'
                                                dataKey={name}
                                                stroke={resourceColor(name)}
                                                strokeWidth={2}
                                                dot={{ r: 2.5, fill: resourceColor(name) }}
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
                    </span>
                </div>
            </div>
        </div>
    );
}
