'use client';

import { tickToDate } from '@/components/client/TickDisplay';
import { GranularityButtonGroup, useGranularity, type Granularity } from '@/components/client/GranularityButtonGroup';
import { ProductIcon } from '@/components/client/ProductIcon';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { usePriceScaleModePreference, type PriceScaleMode } from '@/hooks/uiPreferences';
import {
    DECADE_WINDOW,
    DECADE_YEARS,
    HISTORY_BUCKET_LIMIT,
    MONTHS_PER_YEAR,
    YEAR_WINDOW,
    monthShortName,
} from '@/lib/historyChartAxis';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { START_YEAR, TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';
import type { ResourceProcessLevel } from '@/simulation/planet/claims';
import { RESOURCES_BY_NAME } from '@/simulation/planet/resourceCatalog';
import {
    beverageResourceType,
    cementResourceType,
    chemicalResourceType,
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
import { ChevronDown, ChevronUp } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLocale, useTranslations } from 'next-intl';
import { useIsSmallScreen } from '@/hooks/useMobile';

const LEVEL_LABEL_KEYS = {
    raw: 'resourceRaw',
    refined: 'resourceRefined',
    manufactured: 'resourceManufactured',
    services: 'resourceServices',
} as const;

const RESOURCE_COLOR_MAP: Record<string, string> = {
    // -------------------------------------------------------------
    // Iron / Steel / Metal — ColorBrewer "Oranges" / "YlOrRd" ramp
    // -------------------------------------------------------------
    [ironOreResourceType.name]: '#b34728', // Raw rust / iron ore
    [steelResourceType.name]: '#cc6633', // Refined steel orange
    [machineryResourceType.name]: '#e68540', // Heavy industrial orange
    [vehicleResourceType.name]: '#fa9d52', // Bright finished vehicle orange

    // -------------------------------------------------------------
    // Water — Nord / ColorBrewer "Blues"
    // -------------------------------------------------------------
    [waterResourceType.name]: '#3b82f6', // Vibrant liquid blue

    // -------------------------------------------------------------
    // Food & Drink — ColorBrewer "YlGn" (Fresh agricultural green)
    // -------------------------------------------------------------
    [produceResourceType.name]: '#409c48', // Fresh produce green
    [processedFoodResourceType.name]: '#6abf59', // Processed goods lime-green
    [beverageResourceType.name]: '#93db6e', // Light refreshing green

    // -------------------------------------------------------------
    // Coal — Earth / Dark Carbon tone
    // -------------------------------------------------------------
    [coalResourceType.name]: '#4a3b32', // Dark anthracite charcoal

    // -------------------------------------------------------------
    // Oil & Petrochemicals — Viridis / Goldenrod to Chemical Green
    // -------------------------------------------------------------
    [crudeOilResourceType.name]: '#6b5314', // Dark raw petroleum
    [fuelResourceType.name]: '#a88118', // Refined fuel gold
    [plasticResourceType.name]: '#d4a828', // Synthetic plastic yellow
    [chemicalResourceType.name]: '#a3b828', // Industrial chemical olive-yellow
    [pesticideResourceType.name]: '#7d9e2b', // Agrochemical green
    [pharmaceuticalResourceType.name]: '#528a38', // Clinical green

    // -------------------------------------------------------------
    // Wood & Paper — ColorBrewer "Greens" (Forest to Pulp)
    // -------------------------------------------------------------
    [logsResourceType.name]: '#345229', // Deep forest timber
    [lumberResourceType.name]: '#4d733e', // Milled lumber green
    [paperResourceType.name]: '#6f965d', // Light craft paper sage
    [furnitureResourceType.name]: '#94b882', // Finished wood light green

    // -------------------------------------------------------------
    // Stone & Construction — Natural Mineral & Glass palette
    // -------------------------------------------------------------
    [stoneResourceType.name]: '#706e6b', // Rough granite gray
    [sandResourceType.name]: '#c2b280', // Warm desert sand
    [limestoneResourceType.name]: '#9c988b', // Pale mineral gray
    [cementResourceType.name]: '#7e8387', // Cool powdered cement
    [concreteResourceType.name]: '#61676c', // Dark structural concrete
    [glassResourceType.name]: '#78c6d6', // Translucent cyan glass

    // -------------------------------------------------------------
    // Copper & Electronics — Metallic Copper to High-Tech Teal
    // -------------------------------------------------------------
    [copperOreResourceType.name]: '#a35029', // Raw copper rock
    [copperResourceType.name]: '#c96f3c', // Refined metallic copper
    [siliconWaferResourceType.name]: '#4b9bb0', // Clean tech silicon blue
    [electronicsResourceType.name]: '#337f94', // Circuit board teal
    [consumerElectronicsResourceType.name]: '#226073', // Finished tech dark teal

    // -------------------------------------------------------------
    // Cotton & Textiles — ColorBrewer "Purples" / "BuPu"
    // -------------------------------------------------------------
    [cottonResourceType.name]: '#c4b5fd', // Soft raw cotton lavender
    [fabricResourceType.name]: '#a78bfa', // Woven fabric violet
    [clothingResourceType.name]: '#8b5cf6', // Finished garment rich purple

    // -------------------------------------------------------------
    // Packaging — ColorBrewer "RdPu" (Muted Berry Pink)
    // -------------------------------------------------------------
    [packagingResourceType.name]: '#db7093', // Distinct cardboard/wrap magenta-pink

    // -------------------------------------------------------------
    // Services — Nord Slate / Teal Blue Sequential Palette
    // -------------------------------------------------------------
    [administrativeServiceResourceType.name]: '#475569', // Bureaucratic slate
    [logisticsServiceResourceType.name]: '#3b82f6', // Freight blue
    [constructionServiceResourceType.name]: '#60a5fa', // Builder light blue
    [groceryServiceResourceType.name]: '#34d399', // Market mint green
    [retailServiceResourceType.name]: '#38bdf8', // Commercial sky blue
    [healthcareServiceResourceType.name]: '#2dd4bf', // Medical teal
    [educationServiceResourceType.name]: '#818cf8', // Academic indigo
    [maintenanceServiceResourceType.name]: '#64748b', // Utility steel gray
};
function resourceColor(name: string): string {
    return RESOURCE_COLOR_MAP[name] ?? '#a0a0a0';
}

type Row = { bucket: number; avgPrice: number; priceFloor: number };

type MergedPoint = {
    bucket: number;
    yearLabel?: string;
} & Record<string, number | null>;

type Props = {
    planetId: string;
    allResourceNames: string[];
    isOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
};

export function MultiProductPriceChartTrigger({
    isOpen,
    onToggle,
}: {
    isOpen: boolean;
    onToggle: () => void;
}): React.ReactElement {
    const t = useTranslations('Market');
    return (
        <Button
            type='button'
            variant='ghost'
            onClick={onToggle}
            className='flex items-center gap-1 px-0 py-0 rounded h-7 hover:bg-transparent cursor-pointer text-sm font-semibold'
            aria-expanded={isOpen}
        >
            {isOpen ? <ChevronUp className='w-4 h-4 shrink-0' /> : <ChevronDown className='w-4 h-4 shrink-0' />}
            {t('priceComparison')}
        </Button>
    );
}

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
                relative flex flex-col items-center justify-center gap-1 w-[46px] h-[46px] rounded-md
                transition-all duration-150 ease-in-out select-none 
                ${isSelected ? 'translate-y-[0px] scale-105' : 'bg-card  opacity-80'}
            `}
            style={{
                backgroundColor: isSelected ? color : undefined,
                boxShadow: isSelected
                    ? `inset 0 2px 4px rgba(0,0,0,0.6), 0 0 0 2px ${color}`
                    : `2px 3px 6px rgba(0,0,0,0.5), inset 1px 1px 2px rgba(255,255,255,0.08)`,
            }}
        >
            <ProductIcon productName={name} size={36} />
        </button>
    );
}

function getLevelForResource(name: string): ResourceProcessLevel {
    const level = RESOURCES_BY_NAME.get(name)?.level;
    if (
        level === 'raw' ||
        level === 'refined' ||
        level === 'manufactured' ||
        level === 'services' ||
        level === 'internal'
    ) {
        return level;
    }
    return 'raw';
}

function ProductSelector({
    allResourceNames,
    selected,
    onChange,
}: {
    allResourceNames: string[];
    selected: string[];
    onChange: (names: string[]) => void;
}) {
    const tl = useTranslations('Levels');
    const t = useTranslations('Market');
    const toggle = (name: string) => {
        if (selected.includes(name)) {
            onChange(selected.filter((s) => s !== name));
        } else {
            onChange([...selected, name]);
        }
    };
    const selectAllInLevel = (names: string[]) => {
        const missing = names.filter((name) => !selected.includes(name));
        if (missing.length > 0) {
            onChange([...selected, ...missing]);
        }
    };
    const selectNoneInLevel = (names: string[]) => {
        onChange(selected.filter((name) => !names.includes(name)));
    };

    const groups = useMemo(() => {
        const byLevel = new Map<ResourceProcessLevel, string[]>();
        for (const name of allResourceNames) {
            const level = getLevelForResource(name);
            const group = byLevel.get(level) ?? [];
            group.push(name);
            byLevel.set(level, group);
        }
        return (['raw', 'refined', 'manufactured', 'services'] as const)
            .filter((l) => (byLevel.get(l)?.length ?? 0) > 0)
            .map((level) => ({ level, names: byLevel.get(level)! }));
    }, [allResourceNames]);

    return (
        <div className='space-y-3'>
            {groups.map(({ level, names }) => (
                <div key={level}>
                    <div className='flex items-center justify-between w-[325px] mb-1'>
                        <div className='text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 select-none'>
                            {tl(LEVEL_LABEL_KEYS[level])}
                        </div>
                        <div className='flex gap-1'>
                            <button
                                type='button'
                                onClick={() => selectAllInLevel(names)}
                                className='px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors'
                            >
                                {t('selectAll')}
                            </button>
                            <button
                                type='button'
                                onClick={() => selectNoneInLevel(names)}
                                className='px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors'
                            >
                                {t('selectNone')}
                            </button>
                        </div>
                    </div>
                    <div className='flex flex-wrap gap-2 w-[325px]'>
                        {names.map((name) => (
                            <ProductToggleButton
                                key={name}
                                name={name}
                                isSelected={selected.includes(name)}
                                onClick={() => toggle(name)}
                            />
                        ))}
                    </div>
                </div>
            ))}
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

type QueryResult = { productName: string; granularity: Granularity; history: Row[]; isLoading: boolean };

function resultKey(granularity: Granularity, productName: string): string {
    return `${granularity}:${productName}`;
}

export function pickResults(
    resultsMap: Record<string, QueryResult>,
    selectedProducts: string[],
    granularity: Granularity,
): QueryResult[] {
    const arr: QueryResult[] = [];
    for (const name of selectedProducts) {
        const r = resultsMap[resultKey(granularity, name)];
        if (r) {
            arr.push(r);
        }
    }
    return arr;
}

function ProductQuerySlot({
    planetId,
    productName,
    granularity,
    onResult,
}: {
    planetId: string;
    productName: string;
    granularity: Granularity;
    onResult: (name: string, granularity: Granularity, history: Row[], isLoading: boolean) => void;
}): null {
    const trpc = useTRPC();
    const limit = HISTORY_BUCKET_LIMIT[granularity];
    const query = useSimulationQuery(
        trpc.simulation.getProductPriceHistory.queryOptions({
            planetId,
            productName,
            granularity,
            limit,
        }),
    );

    useEffect(() => {
        if (query.isPlaceholderData) {
            return;
        }
        const history = (query.data?.history ?? []).map((r) => ({
            bucket: r.bucket,
            avgPrice: r.avgPrice,
            priceFloor: r.priceFloor,
        }));
        onResult(productName, granularity, history, query.isLoading);
    }, [query.data, query.isLoading, query.isPlaceholderData, productName, granularity, onResult]);

    return null;
}

function useQueryResults() {
    const [results, setResults] = useState<Record<string, QueryResult>>({});

    const onResult = useCallback((name: string, granularity: Granularity, history: Row[], isLoading: boolean) => {
        const key = resultKey(granularity, name);
        setResults((prev) => {
            const existing = prev[key];
            if (
                existing &&
                existing.isLoading === isLoading &&
                existing.history.length === history.length &&
                existing.history.every(
                    (r, i) =>
                        r.bucket === history[i]?.bucket &&
                        r.avgPrice === history[i]?.avgPrice &&
                        r.priceFloor === history[i]?.priceFloor,
                )
            ) {
                return prev;
            }
            return { ...prev, [key]: { productName: name, granularity, history, isLoading } };
        });
    }, []);

    return { results, onResult };
}

const EMPTY_WINDOWS: Record<Granularity, { unit: number; buckets: number }> = {
    monthly: { unit: TICKS_PER_MONTH, buckets: MONTHS_PER_YEAR },
    yearly: { unit: TICKS_PER_YEAR, buckets: YEAR_WINDOW },
    decade: { unit: TICKS_PER_YEAR * DECADE_YEARS, buckets: DECADE_WINDOW },
};

export function emptyXDomain(granularity: Granularity, liveTick: number): [number, number] {
    const { unit, buckets } = EMPTY_WINDOWS[granularity];
    const span = unit * buckets;
    const end = Math.max(span, Math.ceil(liveTick / unit) * unit);
    return [end - span, end];
}

export default function MultiProductPriceChart({
    planetId,
    allResourceNames,
    isOpen: controlledIsOpen,
    onOpenChange,
}: Props): React.ReactElement {
    const locale = useLocale();
    const t = useTranslations('Market');
    const { granularity, setGranularity, currentTick } = useGranularity();
    const trpc = useTRPC();
    const smallScreen = useIsSmallScreen();

    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const isControlled = controlledIsOpen !== undefined;
    const isOpen = isControlled ? controlledIsOpen : internalIsOpen;
    const setIsOpen = (open: boolean) => {
        if (isControlled) {
            onOpenChange?.(open);
        } else {
            setInternalIsOpen(open);
        }
    };
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [rescaleMode, setRescaleMode] = usePriceScaleModePreference();
    const { results: resultsMap, onResult } = useQueryResults();

    const { data: marketOverview } = useSimulationQuery(
        trpc.simulation.getPlanetMarketOverview.queryOptions({ planetId, average: false }, { enabled: isOpen }),
    );

    const liveTick = marketOverview?.tick ?? 0;

    const livePrices = useMemo(() => {
        const map = new Map<string, { price: number; relative: number }>();
        for (const row of marketOverview?.rows ?? []) {
            map.set(row.resourceName, {
                price: row.clearingPrice,
                relative: row.priceCostRatio > 0 ? row.priceCostRatio : row.clearingPrice,
            });
        }
        return map;
    }, [marketOverview]);

    const results: QueryResult[] = useMemo(
        () => pickResults(resultsMap, selectedProducts, granularity),
        [resultsMap, selectedProducts, granularity],
    );

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
                        const year = START_YEAR + Math.floor(totalMonths / 12);
                        const monthIdx = totalMonths % 12;
                        bucketToYearLabel.set(bucket, `${monthShortName(locale, monthIdx)} ${year}`);
                    } else if (granularity === 'yearly') {
                        const year = Math.floor(tick / 360);
                        bucketToYearLabel.set(bucket, `${START_YEAR + year}`);
                    } else {
                        const year = Math.floor(tick / 360);
                        bucketToYearLabel.set(bucket, `${START_YEAR + year}`);
                    }
                }
            }
        }

        if (liveTick > 0 && livePrices.size > 0 && selectedProducts.length > 0) {
            const livePoint: MergedPoint = { bucket: liveTick };
            let hasLive = false;
            for (const name of selectedProducts) {
                const live = livePrices.get(name);
                if (!live) {
                    continue;
                }
                livePoint[name] = rescaleMode === 'relative' ? live.relative : live.price;
                hasLive = true;
            }
            if (hasLive) {
                allBuckets.set(liveTick, livePoint);
                const { monthIndex, year } = tickToDate(liveTick);
                if (granularity === 'monthly') {
                    bucketToYearLabel.set(liveTick, `${monthShortName(locale, monthIndex)} ${year}`);
                } else {
                    bucketToYearLabel.set(liveTick, `${year}`);
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
    }, [results, selectedProducts, granularity, rescaleMode, liveTick, livePrices, locale]);

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
        if (bucket === liveTick) {
            const { monthIndex, year } = tickToDate(bucket);
            return granularity === 'monthly' ? monthShortName(locale, monthIndex) : `${year}`;
        }
        if (granularity === 'monthly') {
            const totalMonths = Math.floor(bucket / 30);
            const monthIdx = totalMonths % 12;
            return monthShortName(locale, monthIdx);
        }
        return `${START_YEAR + Math.floor(bucket / 360)}`;
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
        mergedData.length >= 2
            ? [mergedData[0].bucket, mergedData[mergedData.length - 1].bucket]
            : emptyXDomain(granularity, liveTick);

    const yTickFormatter = (v: number) =>
        rescaleMode === 'relative' ? `${v.toFixed(1)}×` : formatNumberWithUnit(v, 'currency', planetId, locale);

    return (
        <div className='flex flex-col gap-3 text-outline-strong'>
            {!isControlled && (
                <div className='text-sm font-semibold flex items-center flex-wrap gap-2'>
                    <MultiProductPriceChartTrigger isOpen={isOpen} onToggle={() => setIsOpen(!isOpen)} />
                </div>
            )}

            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        key='content'
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                    >
                        <div className='flex flex-col gap-3'>
                            <div className='flex flex-row flex-wrap gap-2'>
                                <span className='flex-shrink-0'>
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
                                </span>

                                <span className='flex-1 relative pt-4'>
                                    <div className='flex items-center justify-between gap-2 pb-2'>
                                        <div className='flex items-center gap-2'>
                                            <Tabs
                                                value={rescaleMode}
                                                onValueChange={(v) => setRescaleMode(v as PriceScaleMode)}
                                            >
                                                <TabsList className='h-6 p-0'>
                                                    <TabsTrigger
                                                        value='absolute'
                                                        className='text-xs px-2 bg-muted/50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                                                    >
                                                        {t('price')}
                                                    </TabsTrigger>
                                                    <TabsTrigger
                                                        value='relative'
                                                        className='text-xs px-2 bg-muted/50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                                                    >
                                                        {smallScreen ? t('priceOverCostShort') : t('priceOverCost')}
                                                    </TabsTrigger>
                                                </TabsList>
                                            </Tabs>
                                            <Button
                                                type='button'
                                                disabled={selectedProducts.length === 0}
                                                onClick={() => setSelectedProducts([])}
                                                className='px-2 py-0.5 text-xs rounded h-6 cursor-pointer'
                                            >
                                                {t('clear')}
                                            </Button>
                                        </div>
                                        <GranularityButtonGroup
                                            granularity={granularity}
                                            onChange={setGranularity}
                                            currentTick={currentTick}
                                        />
                                    </div>
                                    <div
                                        className={`h-[480px] ${isLoading ? 'opacity-60 animate-pulse pointer-events-none select-none' : ''}`}
                                    >
                                        <ResponsiveContainer width='100%' height='100%'>
                                            <LineChart
                                                data={mergedData}
                                                margin={{ top: 0, right: 0, left: -10, bottom: 0 }}
                                            >
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
                                                                {[...payload]
                                                                    .sort(
                                                                        (a, b) =>
                                                                            ((b.value as number) ?? 0) -
                                                                            ((a.value as number) ?? 0),
                                                                    )
                                                                    .map((p) => (
                                                                        <div
                                                                            key={p.name}
                                                                            style={{ color: p.color ?? '#e2e8f0' }}
                                                                        >
                                                                            {p.name}:{' '}
                                                                            {rescaleMode === 'relative'
                                                                                ? `${(p.value as number).toFixed(2)}×`
                                                                                : formatNumberWithUnit(
                                                                                      p.value as number,
                                                                                      'currency',
                                                                                      planetId,
                                                                                      locale,
                                                                                  )}
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
                                    {selectedProducts.length === 0 && (
                                        <div className='absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none text-outline-strong'>
                                            {t('selectProductsPrompt')}
                                        </div>
                                    )}
                                </span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
