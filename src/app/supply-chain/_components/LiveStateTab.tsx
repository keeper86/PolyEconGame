'use client';

import { useMemo, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useTRPC } from '@/lib/trpc';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Agent } from '@/simulation/planet/planet';
import type { ProductionFacility } from '@/simulation/planet/storage';
import { computeSupplyChainBalance } from './computeBalance';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
    if (Math.abs(n) >= 1_000_000) {
        return `${(n / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(n) >= 1_000) {
        return `${(n / 1_000).toFixed(1)}k`;
    }
    return n.toFixed(1);
}

function pct(ratio: number): string {
    return `${Math.round(Math.min(ratio, 999) * 100)}%`;
}

function effColor(eff: number): string {
    if (eff >= 0.95) {
        return 'text-green-600';
    }
    if (eff >= 0.7) {
        return 'text-amber-600';
    }
    return 'text-red-600';
}

// ─── Data types ───────────────────────────────────────────────────────────────

interface FacilityAggRow {
    name: string;
    instanceCount: number;
    totalScale: number;
    totalMaxScale: number;
    avgEfficiency: number;
    // Production actuals
    totalActualProduced: Record<string, number>;
    // Bottleneck analysis
    mainBottleneck: 'workers' | 'resources' | 'none';
    worstWorkerLevel: string;
    worstWorkerEff: number;
    worstResourceName: string;
    worstResourceEff: number;
    // Per-resource avg efficiency across instances (for tooltip)
    avgResourceEff: Record<string, number>;
    avgWorkerEff: Record<string, number>;
}

interface ResourceActualRow {
    resourceName: string;
    actualProducedPerTick: number;
    theoreticalMaxPerTick: number;
    effectivenessRatio: number;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function aggregateFacilities(agents: Agent[]): FacilityAggRow[] {
    const map = new Map<
        string,
        {
            instanceCount: number;
            totalScale: number;
            totalMaxScale: number;
            effWeightedSum: number;
            actualProduced: Record<string, number>;
            // Per-resource sums for averages (weighted by scale)
            resourceEffWeighted: Record<string, number>;
            resourceEffScaleSum: Record<string, number>;
            workerEffWeighted: Record<string, number>;
            workerEffScaleSum: Record<string, number>;
        }
    >();

    function getEntry(name: string) {
        if (!map.has(name)) {
            map.set(name, {
                instanceCount: 0,
                totalScale: 0,
                totalMaxScale: 0,
                effWeightedSum: 0,
                actualProduced: {},
                resourceEffWeighted: {},
                resourceEffScaleSum: {},
                workerEffWeighted: {},
                workerEffScaleSum: {},
            });
        }
        return map.get(name)!;
    }

    for (const agent of agents) {
        for (const planetAssets of Object.values(agent.assets ?? {})) {
            for (const fac of (planetAssets.productionFacilities as ProductionFacility[]) ?? []) {
                const entry = getEntry(fac.name);
                entry.instanceCount++;
                entry.totalScale += fac.scale;
                entry.totalMaxScale += fac.maxScale;

                const eff = fac.lastTickResults?.overallEfficiency ?? 0;
                entry.effWeightedSum += eff * fac.scale;

                // Accumulate actual production
                for (const [rn, qty] of Object.entries(fac.lastTickResults?.lastProduced ?? {})) {
                    entry.actualProduced[rn] = (entry.actualProduced[rn] ?? 0) + qty;
                }

                // Accumulate resource efficiency (weighted by scale for averaging)
                for (const [rn, re] of Object.entries(fac.lastTickResults?.resourceEfficiency ?? {})) {
                    entry.resourceEffWeighted[rn] = (entry.resourceEffWeighted[rn] ?? 0) + re * fac.scale;
                    entry.resourceEffScaleSum[rn] = (entry.resourceEffScaleSum[rn] ?? 0) + fac.scale;
                }

                // Accumulate worker efficiency
                for (const [edu, we] of Object.entries(fac.lastTickResults?.workerEfficiency ?? {})) {
                    if (we !== undefined) {
                        entry.workerEffWeighted[edu] = (entry.workerEffWeighted[edu] ?? 0) + we * fac.scale;
                        entry.workerEffScaleSum[edu] = (entry.workerEffScaleSum[edu] ?? 0) + fac.scale;
                    }
                }
            }
        }
    }

    const rows: FacilityAggRow[] = [];

    for (const [name, entry] of map.entries()) {
        const avgEff = entry.totalScale > 0 ? entry.effWeightedSum / entry.totalScale : 0;

        // Average resource efficiencies
        const avgResourceEff: Record<string, number> = {};
        for (const [rn, ws] of Object.entries(entry.resourceEffWeighted)) {
            const ss = entry.resourceEffScaleSum[rn] ?? 1;
            avgResourceEff[rn] = ss > 0 ? ws / ss : 0;
        }

        // Average worker efficiencies
        const avgWorkerEff: Record<string, number> = {};
        for (const [edu, ws] of Object.entries(entry.workerEffWeighted)) {
            const ss = entry.workerEffScaleSum[edu] ?? 1;
            avgWorkerEff[edu] = ss > 0 ? ws / ss : 0;
        }

        // Worst resource + worker bottleneck
        let worstResourceName = '';
        let worstResourceEff = 1;
        for (const [rn, re] of Object.entries(avgResourceEff)) {
            if (re < worstResourceEff) {
                worstResourceEff = re;
                worstResourceName = rn;
            }
        }

        let worstWorkerLevel = '';
        let worstWorkerEff = 1;
        for (const [edu, we] of Object.entries(avgWorkerEff)) {
            if (we < worstWorkerEff) {
                worstWorkerEff = we;
                worstWorkerLevel = edu;
            }
        }

        const mainBottleneck: FacilityAggRow['mainBottleneck'] =
            worstWorkerEff < worstResourceEff ? 'workers' : worstResourceEff < 0.995 ? 'resources' : 'none';

        rows.push({
            name,
            instanceCount: entry.instanceCount,
            totalScale: entry.totalScale,
            totalMaxScale: entry.totalMaxScale,
            avgEfficiency: avgEff,
            totalActualProduced: entry.actualProduced,
            mainBottleneck,
            worstWorkerLevel,
            worstWorkerEff,
            worstResourceName,
            worstResourceEff,
            avgResourceEff,
            avgWorkerEff,
        });
    }

    return rows.sort((a, b) => a.avgEfficiency - b.avgEfficiency);
}

function buildResourceActuals(
    rows: FacilityAggRow[],
    maxScales: Record<string, number>,
    pop: number,
): ResourceActualRow[] {
    // Tally actual production per resource across all facility types
    const actualByResource: Record<string, number> = {};
    for (const row of rows) {
        for (const [rn, qty] of Object.entries(row.totalActualProduced)) {
            actualByResource[rn] = (actualByResource[rn] ?? 0) + qty;
        }
    }

    // Theoretical production at maxScale + 100% efficiency
    const theoretical = computeSupplyChainBalance(maxScales, pop);
    const theoreticalByResource: Record<string, number> = {};
    for (const r of theoretical.resources) {
        if (!r.isExternalSource && r.producedPerTick > 0) {
            theoreticalByResource[r.resourceName] = r.producedPerTick;
        }
    }

    // Merge
    const allResources = new Set([...Object.keys(actualByResource), ...Object.keys(theoreticalByResource)]);
    const result: ResourceActualRow[] = [];
    for (const rn of allResources) {
        const actual = actualByResource[rn] ?? 0;
        const theoretical = theoreticalByResource[rn] ?? 0;
        if (theoretical === 0 && actual === 0) {
            continue;
        }
        result.push({
            resourceName: rn,
            actualProducedPerTick: actual,
            theoreticalMaxPerTick: theoretical,
            effectivenessRatio: theoretical > 0 ? actual / theoretical : 1,
        });
    }

    return result.sort((a, b) => a.effectivenessRatio - b.effectivenessRatio);
}

// ─── Origin bottleneck tracing ────────────────────────────────────────────────

// Static supply-chain dependency graph – computed once at module load.
// Calling with empty scales still populates `producedBy`/`consumedBy` correctly.
const _STATIC_SC = computeSupplyChainBalance({}, 0);
const RESOURCE_PRODUCERS: Map<string, string[]> = new Map(
    _STATIC_SC.resources.map((r) => [r.resourceName, r.producedBy]),
);

type OriginResult = {
    rootFacility: string;
    /**
     * - `workers`          – not enough staff assigned
     * - `resource_shortage`– the input resource is not being produced in sufficient quantity
     * - `market_failure`   – the resource IS produced at scale but isn't reaching consumers
     *                        (price mismatch, missing buy orders, etc.)
     */
    rootType: 'workers' | 'resource_shortage' | 'market_failure';
    rootResource?: string;
    /** Upstream production effectiveness (0-1) when rootType is market_failure. */
    rootResourceProductionRatio?: number;
    /** True when THIS facility is the root cause (not a downstream victim). */
    isRoot: boolean;
};

// Production effectiveness threshold above which we consider a resource
// "available on the market" (i.e. being produced) and any shortage is a
// market/price failure rather than a physical supply shortage.
const MARKET_FAILURE_PRODUCTION_THRESHOLD = 0.7;

function traceOriginFrom(
    facilityName: string,
    rowsMap: Map<string, FacilityAggRow>,
    resourceProductionRatios: Map<string, number>,
    visited: Set<string> = new Set(),
): Omit<OriginResult, 'isRoot'> | null {
    if (visited.has(facilityName)) {
        return null;
    }
    visited.add(facilityName);

    const row = rowsMap.get(facilityName);
    if (!row || row.mainBottleneck === 'none') {
        return null;
    }

    if (row.mainBottleneck === 'workers') {
        return { rootFacility: facilityName, rootType: 'workers' };
    }

    // Resource bottleneck: trace upstream through the worst constrained input.
    const worstResource = row.worstResourceName;
    const producers = RESOURCE_PRODUCERS.get(worstResource) ?? [];

    // Sort bottlenecked upstream producers by worst efficiency first.
    const bottlenecked = [...producers]
        .filter((p) => (rowsMap.get(p)?.mainBottleneck ?? 'none') !== 'none')
        .sort((a, b) => (rowsMap.get(a)?.avgEfficiency ?? 1) - (rowsMap.get(b)?.avgEfficiency ?? 1));

    for (const upstream of bottlenecked) {
        const result = traceOriginFrom(upstream, rowsMap, resourceProductionRatios, new Set(visited));
        if (result) {
            return result;
        }
    }

    // No bottlenecked upstream producer found – this facility IS the root cause.
    // Determine whether the input resource exists in the economy but isn't
    // being traded (market/price failure) or is simply not produced enough.
    const productionRatio = resourceProductionRatios.get(worstResource) ?? 0;
    if (productionRatio >= MARKET_FAILURE_PRODUCTION_THRESHOLD) {
        // Resource is being produced at scale – consumers can't obtain it.
        return {
            rootFacility: facilityName,
            rootType: 'market_failure',
            rootResource: worstResource,
            rootResourceProductionRatio: productionRatio,
        };
    }
    return {
        rootFacility: facilityName,
        rootType: 'resource_shortage',
        rootResource: worstResource,
        rootResourceProductionRatio: productionRatio,
    };
}

function computeOriginMap(rows: FacilityAggRow[], resourceActuals: ResourceActualRow[]): Map<string, OriginResult> {
    const rowsMap = new Map(rows.map((r) => [r.name, r]));
    const resourceProductionRatios = new Map(resourceActuals.map((r) => [r.resourceName, r.effectivenessRatio]));
    const result = new Map<string, OriginResult>();

    for (const row of rows) {
        if (row.mainBottleneck === 'none') {
            continue;
        }
        const origin = traceOriginFrom(row.name, rowsMap, resourceProductionRatios);
        if (origin) {
            result.set(row.name, { ...origin, isRoot: origin.rootFacility === row.name });
        }
    }

    return result;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScaleBar({ scale, maxScale }: { scale: number; maxScale: number }) {
    const pctVal = maxScale > 0 ? Math.min(1, scale / maxScale) : 0;
    return (
        <div className='flex items-center gap-1.5'>
            <div className='flex-1 bg-muted rounded-full h-1.5 overflow-hidden min-w-12'>
                <div className='h-full rounded-full bg-blue-500' style={{ width: `${pctVal * 100}%` }} />
            </div>
            <span className='font-mono text-xs text-muted-foreground w-16 text-right shrink-0'>
                {fmt(scale)}&nbsp;/&nbsp;{fmt(maxScale)}
            </span>
        </div>
    );
}

function EffBar({ eff }: { eff: number }) {
    const pctVal = Math.min(1, eff);
    const color = eff >= 0.95 ? 'bg-green-500' : eff >= 0.7 ? 'bg-amber-500' : 'bg-red-500';
    return (
        <div className='flex items-center gap-1.5'>
            <div className='flex-1 bg-muted rounded-full h-1.5 overflow-hidden min-w-12'>
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pctVal * 100}%` }} />
            </div>
            <span className={`font-mono text-xs w-10 text-right shrink-0 ${effColor(eff)}`}>{pct(eff)}</span>
        </div>
    );
}

function BottleneckBadge({ row }: { row: FacilityAggRow }) {
    if (row.mainBottleneck === 'none') {
        return <span className='text-xs text-green-600'>✓ ok</span>;
    }
    if (row.mainBottleneck === 'workers') {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Badge variant='outline' className='text-amber-600 border-amber-400 text-[10px] cursor-help'>
                            workers ({pct(row.worstWorkerEff)})
                        </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                        <div className='text-xs space-y-0.5'>
                            <div className='font-medium mb-1'>Worker fill rates</div>
                            {Object.entries(row.avgWorkerEff).map(([edu, e]) => (
                                <div key={edu} className='flex justify-between gap-4'>
                                    <span>{edu}</span>
                                    <span className={effColor(e)}>{pct(e)}</span>
                                </div>
                            ))}
                        </div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Badge variant='outline' className='text-red-600 border-red-400 text-[10px] cursor-help'>
                        <span className='max-w-28 truncate'>{row.worstResourceName}</span>
                        &nbsp;({pct(row.worstResourceEff)})
                    </Badge>
                </TooltipTrigger>
                <TooltipContent>
                    <div className='text-xs space-y-0.5 max-h-48 overflow-auto'>
                        <div className='font-medium mb-1'>Resource availability</div>
                        {Object.entries(row.avgResourceEff)
                            .sort(([, a], [, b]) => a - b)
                            .map(([rn, e]) => (
                                <div key={rn} className='flex justify-between gap-4'>
                                    <span className='truncate max-w-36'>{rn}</span>
                                    <span className={effColor(e)}>{pct(e)}</span>
                                </div>
                            ))}
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

function rootTypeMeta(type: OriginResult['rootType']): {
    icon: string;
    badgeClass: string;
    label: string;
} {
    switch (type) {
        case 'workers':
            return {
                icon: '👷',
                badgeClass: 'text-amber-700 border-amber-500 bg-amber-50 dark:bg-amber-950/30',
                label: 'worker shortage',
            };
        case 'resource_shortage':
            return {
                icon: '🏭',
                badgeClass: 'text-red-700 border-red-500 bg-red-50 dark:bg-red-950/30',
                label: 'no supply',
            };
        case 'market_failure':
            return {
                icon: '💸',
                badgeClass: 'text-purple-700 border-purple-400 bg-purple-50 dark:bg-purple-950/30',
                label: 'not trading',
            };
    }
}

function OriginBadge({ facilityName, originMap }: { facilityName: string; originMap: Map<string, OriginResult> }) {
    const origin = originMap.get(facilityName);
    if (!origin) {
        return <span className='text-xs text-muted-foreground'>—</span>;
    }

    if (origin.isRoot) {
        const meta = rootTypeMeta(origin.rootType);
        let rootLabel = meta.label;
        if (origin.rootType !== 'workers') {
            rootLabel = `${meta.label}: ${origin.rootResource ?? '?'}`;
        }
        let tooltipText = '';
        if (origin.rootType === 'workers') {
            tooltipText =
                'Root cause: insufficient workers. Fixing staffing here will unblock all downstream facilities.';
        } else if (origin.rootType === 'resource_shortage') {
            tooltipText = `Root cause: "${origin.rootResource}" is not being produced in sufficient quantity (${Math.round((origin.rootResourceProductionRatio ?? 0) * 100)}% of theoretical max). Build more upstream production capacity.`;
        } else {
            tooltipText = `Root cause: "${origin.rootResource}" is being produced at ${Math.round((origin.rootResourceProductionRatio ?? 0) * 100)}% but isn't reaching this facility. Check market prices, buy order limits, or agent cash reserves.`;
        }
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Badge variant='outline' className={`${meta.badgeClass} text-[10px] font-semibold cursor-help`}>
                            <span className='max-w-44 truncate'>
                                {meta.icon} {rootLabel}
                            </span>
                        </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                        <div className='text-xs max-w-64'>{tooltipText}</div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className='text-xs cursor-help text-muted-foreground whitespace-nowrap'>
                        {'↑ '}
                        <span className='font-medium underline decoration-dotted text-foreground/70'>
                            {origin.rootFacility}
                        </span>
                    </span>
                </TooltipTrigger>
                <TooltipContent>
                    <div className='text-xs max-w-60'>
                        Downstream victim of <span className='font-medium'>{origin.rootFacility}</span> (
                        {origin.rootType === 'workers'
                            ? 'worker shortage'
                            : origin.rootType === 'market_failure'
                              ? `${origin.rootResource} not trading`
                              : `missing supply: ${origin.rootResource}`}
                        ). Fixing the root cause will resolve this bottleneck automatically.
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

// ─── Sorting helpers ──────────────────────────────────────────────────────────

type FacilitySortKey = 'name' | 'instances' | 'scale' | 'efficiency' | 'bottleneck' | 'output' | 'origin';
type ResourceSortKey = 'name' | 'actual' | 'theoretical' | 'effectiveness';
type SortDir = 'asc' | 'desc';

function SortIcon({ column, sortKey, dir }: { column: string; sortKey: string; dir: SortDir }) {
    if (column !== sortKey) {
        return <ArrowUpDown className='inline ml-1 h-3 w-3 opacity-40' />;
    }
    return dir === 'asc' ? <ArrowUp className='inline ml-1 h-3 w-3' /> : <ArrowDown className='inline ml-1 h-3 w-3' />;
}

function sortFacilityRows(
    rows: FacilityAggRow[],
    key: FacilitySortKey,
    dir: SortDir,
    originMap?: Map<string, OriginResult>,
): FacilityAggRow[] {
    const sorted = [...rows].sort((a, b) => {
        switch (key) {
            case 'name':
                return a.name.localeCompare(b.name);
            case 'instances':
                return a.instanceCount - b.instanceCount;
            case 'scale': {
                const ra = a.totalMaxScale > 0 ? a.totalScale / a.totalMaxScale : 0;
                const rb = b.totalMaxScale > 0 ? b.totalScale / b.totalMaxScale : 0;
                return ra - rb;
            }
            case 'efficiency':
                return a.avgEfficiency - b.avgEfficiency;
            case 'bottleneck': {
                const order: Record<FacilityAggRow['mainBottleneck'], number> = { none: 0, workers: 1, resources: 2 };
                return order[a.mainBottleneck] - order[b.mainBottleneck];
            }
            case 'output': {
                const ta = Object.values(a.totalActualProduced).reduce((s, v) => s + v, 0);
                const tb = Object.values(b.totalActualProduced).reduce((s, v) => s + v, 0);
                return ta - tb;
            }
            case 'origin': {
                const oa = originMap?.get(a.name);
                const ob = originMap?.get(b.name);
                // none (0) → downstream victim (1) → root cause (2)
                const rank = (o: OriginResult | undefined) => (!o ? 0 : o.isRoot ? 2 : 1);
                return rank(oa) - rank(ob);
            }
        }
    });
    return dir === 'asc' ? sorted : sorted.reverse();
}

function sortResourceRows(rows: ResourceActualRow[], key: ResourceSortKey, dir: SortDir): ResourceActualRow[] {
    const sorted = [...rows].sort((a, b) => {
        switch (key) {
            case 'name':
                return a.resourceName.localeCompare(b.resourceName);
            case 'actual':
                return a.actualProducedPerTick - b.actualProducedPerTick;
            case 'theoretical':
                return a.theoreticalMaxPerTick - b.theoreticalMaxPerTick;
            case 'effectiveness':
                return a.effectivenessRatio - b.effectivenessRatio;
        }
    });
    return dir === 'asc' ? sorted : sorted.reverse();
}

// ─── Main component ───────────────────────────────────────────────────────────

interface LiveStateTabProps {
    onApplyScales: (scales: Record<string, number>) => void;
}

export function LiveStateTab({ onApplyScales }: LiveStateTabProps) {
    const [facSort, setFacSort] = useState<{ key: FacilitySortKey; dir: SortDir }>({ key: 'efficiency', dir: 'asc' });
    const [resSort, setResSort] = useState<{ key: ResourceSortKey; dir: SortDir }>({
        key: 'effectiveness',
        dir: 'asc',
    });

    function toggleFacSort(key: FacilitySortKey) {
        setFacSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    }
    function toggleResSort(key: ResourceSortKey) {
        setResSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    }

    const trpc = useTRPC();

    const { data: agentData, isLoading: agentsLoading } = useSimulationQuery(
        trpc.simulation.getLatestAgents.queryOptions(),
    );
    const { data: planetData, isLoading: planetsLoading } = useSimulationQuery(
        trpc.simulation.getLatestPlanetSummaries.queryOptions(),
    );

    const tick = agentData?.tick ?? 0;
    const agents = useMemo(() => (agentData?.agents.map((a) => a.agentSummary as Agent) ?? []) as Agent[], [agentData]);
    const livePop = planetData?.planets.reduce((s, p) => s + p.populationTotal, 0) ?? 0;

    const facilityRows = useMemo(() => aggregateFacilities(agents), [agents]);

    const maxScales = useMemo(() => {
        const s: Record<string, number> = {};
        for (const row of facilityRows) {
            s[row.name] = row.totalMaxScale;
        }
        return s;
    }, [facilityRows]);

    const resourceActuals = useMemo(
        () => buildResourceActuals(facilityRows, maxScales, livePop),
        [facilityRows, maxScales, livePop],
    );

    const originMap = useMemo(() => computeOriginMap(facilityRows, resourceActuals), [facilityRows, resourceActuals]);

    const rootCausesArray = useMemo(() => {
        const map = new Map<
            string,
            { rootFacility: string; rootType: OriginResult['rootType']; rootResource?: string; victims: string[] }
        >();
        for (const [facName, origin] of originMap.entries()) {
            if (!map.has(origin.rootFacility)) {
                map.set(origin.rootFacility, {
                    rootFacility: origin.rootFacility,
                    rootType: origin.rootType,
                    rootResource: origin.rootResource,
                    victims: [],
                });
            }
            if (!origin.isRoot) {
                map.get(origin.rootFacility)!.victims.push(facName);
            }
        }
        return [...map.values()].sort((a, b) => b.victims.length - a.victims.length);
    }, [originMap]);

    const sortedFacilityRows = useMemo(
        () => sortFacilityRows(facilityRows, facSort.key, facSort.dir, originMap),
        [facilityRows, facSort, originMap],
    );
    const sortedResourceActuals = useMemo(
        () => sortResourceRows(resourceActuals, resSort.key, resSort.dir),
        [resourceActuals, resSort],
    );

    const isLoading = agentsLoading || planetsLoading;

    // Summary stats
    const totalAgents = agentData?.agents.length ?? 0;
    const underperforming = facilityRows.filter((r) => r.avgEfficiency < 0.8).length;
    const globalAvgEff =
        facilityRows.length > 0
            ? facilityRows.reduce((s, r) => s + r.avgEfficiency * r.totalScale, 0) /
              Math.max(
                  1,
                  facilityRows.reduce((s, r) => s + r.totalScale, 0),
              )
            : 0;
    const resourceBottlenecks = facilityRows.filter((r) => r.mainBottleneck === 'resources').length;
    const workerBottlenecks = facilityRows.filter((r) => r.mainBottleneck === 'workers').length;

    // Resources with worst effectiveness ratio (top 5)
    const worstResources = resourceActuals.filter((r) => r.theoreticalMaxPerTick > 0 && r.effectivenessRatio < 0.99);

    if (isLoading && tick === 0) {
        return <div className='py-8 text-center text-sm text-muted-foreground'>Connecting to simulation…</div>;
    }

    if (!isLoading && totalAgents === 0) {
        return (
            <div className='py-8 text-center text-sm text-muted-foreground'>
                No agent data available. Is the simulation running?
            </div>
        );
    }

    return (
        <div className='space-y-4'>
            {/* Status bar */}
            <div className='flex flex-wrap items-center gap-4 p-3 bg-muted/40 rounded-lg border text-sm'>
                <span>
                    Tick: <span className='font-mono font-semibold'>{tick}</span>
                </span>
                <span>
                    Agents: <span className='font-mono font-semibold'>{totalAgents}</span>
                </span>
                <span>
                    Population: <span className='font-mono font-semibold'>{livePop.toLocaleString()}</span>
                </span>
                <span>
                    Facility types: <span className='font-mono font-semibold'>{facilityRows.length}</span>
                </span>
                <div className='ml-auto'>
                    <Button
                        variant='outline'
                        size='sm'
                        onClick={() => onApplyScales(maxScales)}
                        title='Load the actual facility max-scales from the live game into the Balancer tool'
                    >
                        Load game scales into Balancer
                    </Button>
                </div>
            </div>

            {/* Summary cards */}
            <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                <Card>
                    <CardHeader className='pb-1 pt-3 px-4'>
                        <CardTitle className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                            Global Avg Efficiency
                        </CardTitle>
                    </CardHeader>
                    <CardContent className='px-4 pb-3'>
                        <div className={`text-2xl font-bold ${effColor(globalAvgEff)}`}>{pct(globalAvgEff)}</div>
                        <div className='text-[11px] text-muted-foreground mt-0.5'>
                            actual&nbsp;/&nbsp;theoretical production
                        </div>
                    </CardContent>
                </Card>

                <Card className={underperforming > 0 ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/20' : ''}>
                    <CardHeader className='pb-1 pt-3 px-4'>
                        <CardTitle
                            className={`text-xs font-medium uppercase tracking-wide ${underperforming > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}
                        >
                            Under-performing
                        </CardTitle>
                    </CardHeader>
                    <CardContent className='px-4 pb-3'>
                        <div
                            className={`text-2xl font-bold ${underperforming > 0 ? 'text-amber-600' : 'text-green-600'}`}
                        >
                            {underperforming}
                        </div>
                        <div className='text-[11px] text-muted-foreground mt-0.5'>facility types below 80% eff.</div>
                    </CardContent>
                </Card>

                <Card className={resourceBottlenecks > 0 ? 'border-red-300 bg-red-50/40 dark:bg-red-950/20' : ''}>
                    <CardHeader className='pb-1 pt-3 px-4'>
                        <CardTitle
                            className={`text-xs font-medium uppercase tracking-wide ${resourceBottlenecks > 0 ? 'text-red-600' : 'text-muted-foreground'}`}
                        >
                            Resource Bottlenecks
                        </CardTitle>
                    </CardHeader>
                    <CardContent className='px-4 pb-3'>
                        <div
                            className={`text-2xl font-bold ${resourceBottlenecks > 0 ? 'text-red-600' : 'text-green-600'}`}
                        >
                            {resourceBottlenecks}
                        </div>
                        <div className='text-[11px] text-muted-foreground mt-0.5'>facility types input-limited</div>
                    </CardContent>
                </Card>

                <Card className={workerBottlenecks > 0 ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/20' : ''}>
                    <CardHeader className='pb-1 pt-3 px-4'>
                        <CardTitle
                            className={`text-xs font-medium uppercase tracking-wide ${workerBottlenecks > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}
                        >
                            Worker Bottlenecks
                        </CardTitle>
                    </CardHeader>
                    <CardContent className='px-4 pb-3'>
                        <div
                            className={`text-2xl font-bold ${workerBottlenecks > 0 ? 'text-amber-600' : 'text-green-600'}`}
                        >
                            {workerBottlenecks}
                        </div>
                        <div className='text-[11px] text-muted-foreground mt-0.5'>facility types worker-limited</div>
                    </CardContent>
                </Card>
            </div>

            {/* Root Cause Bottleneck Analysis */}
            {rootCausesArray.length > 0 && (
                <Card className='border-orange-200 dark:border-orange-900'>
                    <CardHeader className='pb-2 pt-3 px-4'>
                        <CardTitle className='text-sm font-semibold text-orange-700 dark:text-orange-400'>
                            🎯 Root Cause Analysis ({rootCausesArray.length} origin
                            {rootCausesArray.length !== 1 ? 's' : ''})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className='px-4 pb-3'>
                        <p className='text-xs text-muted-foreground mb-3'>
                            These are the origin bottlenecks driving supply chain failures. Fixing them will unblock all
                            downstream facilities.
                        </p>
                        <div className='space-y-2'>
                            {rootCausesArray.map(({ rootFacility, rootType, rootResource, victims }) => (
                                <div
                                    key={rootFacility}
                                    className='flex items-start gap-2 text-xs p-2 rounded border bg-muted/30 border-border'
                                >
                                    {(() => {
                                        const meta = rootTypeMeta(rootType);
                                        return (
                                            <Badge
                                                variant='outline'
                                                className={`${meta.badgeClass} text-[10px] font-semibold shrink-0 mt-0.5`}
                                            >
                                                {meta.icon} root
                                            </Badge>
                                        );
                                    })()}
                                    <div className='flex-1 min-w-0'>
                                        <span className='font-semibold'>{rootFacility}</span>
                                        <span className='text-muted-foreground ml-1.5'>
                                            {rootType === 'workers' && '(worker shortage)'}
                                            {rootType === 'resource_shortage' && `(supply shortage: ${rootResource})`}
                                            {rootType === 'market_failure' &&
                                                `(not trading: ${rootResource} is produced but not purchased)`}
                                        </span>
                                        {victims.length > 0 && (
                                            <div className='mt-0.5 text-muted-foreground'>
                                                Blocks:{' '}
                                                {victims.map((v, i) => (
                                                    <span key={v}>
                                                        {i > 0 && ', '}
                                                        <span className='font-medium text-foreground/70'>{v}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Production effectiveness heat-map (worst resources) */}
            {worstResources.length > 0 && (
                <Card className='border-red-200'>
                    <CardHeader className='pb-2 pt-3 px-4'>
                        <CardTitle className='text-sm font-semibold text-red-700'>
                            ⚠ Under-produced Resources ({worstResources.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className='px-4 pb-3'>
                        <div className='space-y-1.5'>
                            {worstResources.slice(0, 12).map((r) => (
                                <div key={r.resourceName} className='flex items-center gap-2'>
                                    <span className='text-xs w-52 shrink-0 truncate font-medium'>{r.resourceName}</span>
                                    <div className='flex-1'>
                                        <EffBar eff={r.effectivenessRatio} />
                                    </div>
                                    <span className='text-[10px] text-muted-foreground w-28 text-right shrink-0'>
                                        {fmt(r.actualProducedPerTick)}&nbsp;/&nbsp;{fmt(r.theoreticalMaxPerTick)}
                                        &nbsp;/tick
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Facility breakdown table */}
            <Card>
                <CardHeader className='pb-2 pt-3 px-4'>
                    <CardTitle className='text-sm font-semibold'>
                        Facility Performance ({facilityRows.length} types)
                    </CardTitle>
                </CardHeader>
                <CardContent className='px-4 pb-3'>
                    <div className='border rounded-lg overflow-auto'>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead
                                        className='min-w-40 cursor-pointer select-none'
                                        onClick={() => toggleFacSort('name')}
                                    >
                                        Facility <SortIcon column='name' sortKey={facSort.key} dir={facSort.dir} />
                                    </TableHead>
                                    <TableHead
                                        className='text-right w-16 cursor-pointer select-none'
                                        onClick={() => toggleFacSort('instances')}
                                    >
                                        Agents <SortIcon column='instances' sortKey={facSort.key} dir={facSort.dir} />
                                    </TableHead>
                                    <TableHead
                                        className='min-w-44 cursor-pointer select-none'
                                        onClick={() => toggleFacSort('scale')}
                                    >
                                        Scale (used / max){' '}
                                        <SortIcon column='scale' sortKey={facSort.key} dir={facSort.dir} />
                                    </TableHead>
                                    <TableHead
                                        className='min-w-36 cursor-pointer select-none'
                                        onClick={() => toggleFacSort('efficiency')}
                                    >
                                        Avg Efficiency{' '}
                                        <SortIcon column='efficiency' sortKey={facSort.key} dir={facSort.dir} />
                                    </TableHead>
                                    <TableHead
                                        className='cursor-pointer select-none'
                                        onClick={() => toggleFacSort('bottleneck')}
                                    >
                                        Main Bottleneck{' '}
                                        <SortIcon column='bottleneck' sortKey={facSort.key} dir={facSort.dir} />
                                    </TableHead>
                                    <TableHead
                                        className='cursor-pointer select-none'
                                        onClick={() => toggleFacSort('origin')}
                                    >
                                        Origin <SortIcon column='origin' sortKey={facSort.key} dir={facSort.dir} />
                                    </TableHead>
                                    <TableHead
                                        className='cursor-pointer select-none'
                                        onClick={() => toggleFacSort('output')}
                                    >
                                        Actual Output / tick{' '}
                                        <SortIcon column='output' sortKey={facSort.key} dir={facSort.dir} />
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedFacilityRows.map((row) => (
                                    <TableRow
                                        key={row.name}
                                        className={
                                            row.avgEfficiency < 0.7
                                                ? 'bg-red-50 dark:bg-red-950/20'
                                                : row.avgEfficiency < 0.95
                                                  ? 'bg-amber-50/60 dark:bg-amber-950/10'
                                                  : ''
                                        }
                                    >
                                        <TableCell className='font-medium text-sm'>{row.name}</TableCell>
                                        <TableCell className='text-right font-mono text-sm'>
                                            {row.instanceCount}
                                        </TableCell>
                                        <TableCell>
                                            <ScaleBar scale={row.totalScale} maxScale={row.totalMaxScale} />
                                        </TableCell>
                                        <TableCell>
                                            <EffBar eff={row.avgEfficiency} />
                                        </TableCell>
                                        <TableCell>
                                            <BottleneckBadge row={row} />
                                        </TableCell>
                                        <TableCell>
                                            <OriginBadge facilityName={row.name} originMap={originMap} />
                                        </TableCell>
                                        <TableCell>
                                            <div className='flex flex-wrap gap-x-3 gap-y-0.5'>
                                                {Object.entries(row.totalActualProduced).map(([rn, qty]) => (
                                                    <span key={rn} className='text-xs font-mono'>
                                                        <span className='text-muted-foreground'>{rn}: </span>
                                                        {fmt(qty)}
                                                    </span>
                                                ))}
                                                {Object.keys(row.totalActualProduced).length === 0 && (
                                                    <span className='text-xs text-muted-foreground'>—</span>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Resource production: actual vs theoretical */}
            <Card>
                <CardHeader className='pb-2 pt-3 px-4'>
                    <CardTitle className='text-sm font-semibold'>
                        Resource Output: Actual vs Theoretical Maximum
                    </CardTitle>
                </CardHeader>
                <CardContent className='px-4 pb-3'>
                    <p className='text-xs text-muted-foreground mb-3'>
                        Theoretical maximum assumes all facilities run at 100% efficiency at their current max scale.
                        Lower ratios indicate underperformance or throttling.
                    </p>
                    <div className='border rounded-lg overflow-auto'>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead
                                        className='cursor-pointer select-none'
                                        onClick={() => toggleResSort('name')}
                                    >
                                        Resource <SortIcon column='name' sortKey={resSort.key} dir={resSort.dir} />
                                    </TableHead>
                                    <TableHead
                                        className='text-right cursor-pointer select-none'
                                        onClick={() => toggleResSort('actual')}
                                    >
                                        Actual / tick{' '}
                                        <SortIcon column='actual' sortKey={resSort.key} dir={resSort.dir} />
                                    </TableHead>
                                    <TableHead
                                        className='text-right cursor-pointer select-none'
                                        onClick={() => toggleResSort('theoretical')}
                                    >
                                        Theoretical max / tick{' '}
                                        <SortIcon column='theoretical' sortKey={resSort.key} dir={resSort.dir} />
                                    </TableHead>
                                    <TableHead
                                        className='min-w-40 cursor-pointer select-none'
                                        onClick={() => toggleResSort('effectiveness')}
                                    >
                                        Effectiveness{' '}
                                        <SortIcon column='effectiveness' sortKey={resSort.key} dir={resSort.dir} />
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedResourceActuals.map((r) => (
                                    <TableRow
                                        key={r.resourceName}
                                        className={
                                            r.effectivenessRatio < 0.7
                                                ? 'bg-red-50 dark:bg-red-950/20'
                                                : r.effectivenessRatio < 0.95
                                                  ? 'bg-amber-50/60 dark:bg-amber-950/10'
                                                  : ''
                                        }
                                    >
                                        <TableCell className='font-medium text-sm'>{r.resourceName}</TableCell>
                                        <TableCell className='text-right font-mono text-sm'>
                                            {fmt(r.actualProducedPerTick)}
                                        </TableCell>
                                        <TableCell className='text-right font-mono text-sm text-muted-foreground'>
                                            {r.theoreticalMaxPerTick > 0 ? fmt(r.theoreticalMaxPerTick) : '—'}
                                        </TableCell>
                                        <TableCell>
                                            {r.theoreticalMaxPerTick > 0 ? (
                                                <EffBar eff={r.effectivenessRatio} />
                                            ) : (
                                                <span className='text-xs text-muted-foreground'>—</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
