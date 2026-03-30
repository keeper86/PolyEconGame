'use client';

import { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { computeSupplyChainBalance, type FacilityInfo, type ResourceBalance } from './computeBalance';
import DependencyGraph from './DependencyGraph';
import { FACILITY_LEVEL_LABELS, FACILITY_LEVELS } from '@/simulation/planet/facilities';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
    if (Math.abs(n) >= 1_000_000) {
        return `${(n / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(n) >= 1_000) {
        return `${(n / 1_000).toFixed(1)}k`;
    }
    return n.toFixed(1);
}

const LEVEL_BADGE: Record<string, string> = {
    source: 'bg-stone-600 text-white',
    raw: 'bg-amber-600 text-white',
    refined: 'bg-blue-600 text-white',
    manufactured: 'bg-purple-600 text-white',
    services: 'bg-emerald-600 text-white',
};

// ─── FacilityCard ────────────────────────────────────────────────────────────

interface FacilityCardProps {
    facility: FacilityInfo;
    scale: number;
    onScale: (val: number) => void;
    balanceByName: Record<string, ResourceBalance>;
}

function FacilityCard({ facility, scale, onScale, balanceByName }: FacilityCardProps) {
    const isPowerProducer = facility.powerConsumptionPerTick < 0;
    const powerUnits = Math.abs(facility.powerConsumptionPerTick) * (scale || 1);

    return (
        <Card className={scale > 0 ? 'border-primary/40 shadow-sm' : 'opacity-80'}>
            <CardHeader className='pb-2 pt-3 px-4'>
                <div className='flex items-start justify-between gap-2'>
                    <CardTitle className='text-sm font-semibold leading-snug'>{facility.name}</CardTitle>
                    <div className='flex items-center gap-1.5 shrink-0'>
                        {isPowerProducer ? (
                            <Badge
                                variant='outline'
                                className='text-green-600 border-green-400 text-[10px] px-1.5 py-0'
                            >
                                ⚡ +{fmt(powerUnits)}/t
                            </Badge>
                        ) : (
                            <Badge variant='outline' className='text-[10px] px-1.5 py-0'>
                                ⚡ {fmt(facility.powerConsumptionPerTick)}/unit
                            </Badge>
                        )}
                        <span className='text-xl font-bold text-primary w-8 text-right'>{scale}</span>
                    </div>
                </div>
            </CardHeader>

            <CardContent className='px-4 pb-3 space-y-3'>
                {/* Scale controls */}
                <div className='flex items-center gap-2'>
                    <Slider
                        min={0}
                        max={20}
                        step={1}
                        value={[scale]}
                        onValueChange={(values) => onScale(values[0] ?? 0)}
                        className='flex-1'
                    />
                    <Input
                        type='number'
                        min={0}
                        max={999}
                        value={scale}
                        onChange={(e) => onScale(Math.max(0, Number(e.target.value)))}
                        className='w-20 h-7 text-right text-sm'
                    />
                </div>

                {/* Worker requirements (shown only when active) */}
                {scale > 0 && (
                    <div className='text-[11px] text-muted-foreground'>
                        Workers: {fmt(facility.workerRequirement.none * scale)} unskilled ·{' '}
                        {fmt(facility.workerRequirement.primary * scale)} primary ·{' '}
                        {fmt(facility.workerRequirement.secondary * scale)} secondary ·{' '}
                        {fmt(facility.workerRequirement.tertiary * scale)} tertiary
                    </div>
                )}

                {/* Inputs & outputs per tick */}
                <div className='grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]'>
                    {facility.needs.length > 0 && (
                        <div>
                            <div className='font-medium text-muted-foreground mb-0.5'>Input ×{scale || 1} /tick</div>
                            {facility.needs.map((n) => {
                                const bal = balanceByName[n.resourceName];
                                const inDeficit = bal && !bal.isExternalSource && bal.balance < -0.001;
                                return (
                                    <div
                                        key={n.resourceName}
                                        className={`flex justify-between ${inDeficit ? 'text-red-600 font-medium' : 'text-foreground'}`}
                                    >
                                        <span className='truncate mr-1'>{n.resourceName}</span>
                                        <span className='shrink-0'>{fmt(n.quantity * (scale || 1))}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {facility.produces.length > 0 && (
                        <div>
                            <div className='font-medium text-muted-foreground mb-0.5'>Output ×{scale || 1} /tick</div>
                            {facility.produces.map((p) => {
                                const bal = balanceByName[p.resourceName];
                                const inSurplus = bal && !bal.isExternalSource && bal.balance > 0.001;
                                return (
                                    <div
                                        key={p.resourceName}
                                        className={`flex justify-between ${inSurplus ? 'text-green-700' : 'text-foreground'}`}
                                    >
                                        <span className='truncate mr-1'>{p.resourceName}</span>
                                        <span className='shrink-0'>{fmt(p.quantity * (scale || 1))}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {facility.needs.length === 0 && facility.produces.length === 0 && (
                        <div className='text-muted-foreground col-span-2'>Consumes coal → produces power</div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

// ─── SupplyChainTool ─────────────────────────────────────────────────────────

export default function SupplyChainTool() {
    const [scales, setScales] = useState<Record<string, number>>({});
    const [population, setPopulation] = useState<number>(100_000);
    const [levelFilter, setLevelFilter] = useState<string>('all');

    const balance = useMemo(() => computeSupplyChainBalance(scales, population), [scales, population]);

    const balanceByName = useMemo(() => {
        const m: Record<string, ResourceBalance> = {};
        for (const r of balance.resources) {
            m[r.resourceName] = r;
        }
        return m;
    }, [balance]);

    function setScale(name: string, value: number) {
        setScales((prev) => ({ ...prev, [name]: value }));
    }

    function incrementAllScales() {
        setScales((prev) => {
            const next: Record<string, number> = { ...prev };
            for (const f of balance.facilities) {
                next[f.name] = (next[f.name] ?? 0) + 1;
            }
            return next;
        });
    }

    function decrementAllScales() {
        setScales((prev) => {
            const next: Record<string, number> = { ...prev };
            for (const f of balance.facilities) {
                next[f.name] = Math.max(0, (next[f.name] ?? 0) - 1);
            }
            return next;
        });
    }

    const deficits = balance.resources.filter((r) => !r.isExternalSource && r.balance < -0.001);
    const powerBalance = balance.totalPowerProducedPerTick - balance.totalPowerConsumedPerTick;
    const totalSkilled = balance.totalWorkers.primary + balance.totalWorkers.secondary + balance.totalWorkers.tertiary;

    const filteredResources =
        levelFilter === 'all' ? balance.resources : balance.resources.filter((r) => r.resourceLevel === levelFilter);

    const facilitiesByLevel = useMemo(() => {
        const grouped: Record<string, FacilityInfo[]> = {};
        for (const f of balance.facilities) {
            if (!grouped[f.primaryOutputLevel]) {
                grouped[f.primaryOutputLevel] = [];
            }
            grouped[f.primaryOutputLevel].push(f);
        }
        return grouped;
    }, [balance.facilities]);

    const allFilterLevels = ['all', ...FACILITY_LEVELS, 'source'] as const;

    return (
        <div className='space-y-4'>
            {/* Top controls */}
            <div className='flex flex-wrap items-center gap-4 p-4 bg-muted/40 rounded-lg border'>
                <div className='flex items-center gap-2'>
                    <Label htmlFor='population' className='whitespace-nowrap font-semibold'>
                        Population:
                    </Label>
                    <Input
                        id='population'
                        type='number'
                        min={0}
                        step={10_000}
                        value={population}
                        onChange={(e) => setPopulation(Math.max(0, Number(e.target.value)))}
                        className='w-40'
                    />
                </div>
                <span className='text-sm text-muted-foreground'>
                    Service demand: {population.toLocaleString()} units/tick per service
                </span>
                <div className='ml-auto flex items-center gap-2'>
                    <Button variant='outline' size='sm' onClick={incrementAllScales}>
                        + All
                    </Button>
                    <Button variant='outline' size='sm' onClick={decrementAllScales}>
                        - All
                    </Button>
                    <Button variant='outline' size='sm' onClick={() => setScales({})}>
                        Reset All Scales
                    </Button>
                </div>
            </div>

            <Tabs defaultValue='dashboard'>
                <TabsList>
                    <TabsTrigger value='dashboard'>Dashboard</TabsTrigger>
                    <TabsTrigger value='facilities'>Facilities ({balance.facilities.length})</TabsTrigger>
                    <TabsTrigger value='graph'>Dependency Graph</TabsTrigger>
                </TabsList>

                {/* ── DASHBOARD ── */}
                <TabsContent value='dashboard' className='space-y-4 mt-4'>
                    {/* Summary cards */}
                    <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                        <Card>
                            <CardHeader className='pb-1 pt-3 px-4'>
                                <CardTitle className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                                    Power Balance
                                </CardTitle>
                            </CardHeader>
                            <CardContent className='px-4 pb-3'>
                                <div
                                    className={`text-2xl font-bold ${powerBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}
                                >
                                    {powerBalance >= 0 ? '+' : ''}
                                    {fmt(powerBalance)}
                                </div>
                                <div className='text-[11px] text-muted-foreground mt-0.5'>
                                    {fmt(balance.totalPowerProducedPerTick)} produced ·{' '}
                                    {fmt(balance.totalPowerConsumedPerTick)} consumed
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className='pb-1 pt-3 px-4'>
                                <CardTitle className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                                    Unskilled Workers
                                </CardTitle>
                            </CardHeader>
                            <CardContent className='px-4 pb-3'>
                                <div className='text-2xl font-bold'>{fmt(balance.totalWorkers.none)}</div>
                                <div className='text-[11px] text-muted-foreground mt-0.5'>no education required</div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className='pb-1 pt-3 px-4'>
                                <CardTitle className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                                    Skilled Workers
                                </CardTitle>
                            </CardHeader>
                            <CardContent className='px-4 pb-3'>
                                <div className='text-2xl font-bold'>{fmt(totalSkilled)}</div>
                                <div className='text-[11px] text-muted-foreground mt-0.5'>
                                    {fmt(balance.totalWorkers.primary)}p · {fmt(balance.totalWorkers.secondary)}s ·{' '}
                                    {fmt(balance.totalWorkers.tertiary)}t
                                </div>
                            </CardContent>
                        </Card>

                        <Card className={deficits.length > 0 ? 'border-red-300 bg-red-50/50' : ''}>
                            <CardHeader className='pb-1 pt-3 px-4'>
                                <CardTitle
                                    className={`text-xs font-medium uppercase tracking-wide ${deficits.length > 0 ? 'text-red-600' : 'text-muted-foreground'}`}
                                >
                                    Deficits
                                </CardTitle>
                            </CardHeader>
                            <CardContent className='px-4 pb-3'>
                                <div
                                    className={`text-2xl font-bold ${deficits.length > 0 ? 'text-red-600' : 'text-green-600'}`}
                                >
                                    {deficits.length}
                                </div>
                                <div className='text-[11px] text-muted-foreground mt-0.5'>resources in shortage</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Deficit alerts */}
                    {deficits.length > 0 && (
                        <Card className='border-red-300'>
                            <CardHeader className='pb-2 pt-3 px-4'>
                                <CardTitle className='text-sm text-red-600'>⚠ Resource Shortages</CardTitle>
                            </CardHeader>
                            <CardContent className='px-4 pb-3'>
                                <div className='flex flex-wrap gap-2'>
                                    {deficits.map((r) => (
                                        <div
                                            key={r.resourceName}
                                            className='flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-md px-2 py-1 text-sm'
                                        >
                                            <span className='font-medium'>{r.resourceName}</span>
                                            <span className='text-red-600 font-mono text-xs'>{fmt(r.balance)}/t</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Level filter pills */}
                    <div className='flex flex-wrap gap-2'>
                        {allFilterLevels.map((level) => (
                            <button
                                key={level}
                                onClick={() => setLevelFilter(level)}
                                className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                                    levelFilter === level
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'border-border hover:bg-muted'
                                }`}
                            >
                                {level === 'all'
                                    ? 'All'
                                    : ((FACILITY_LEVEL_LABELS as Record<string, string>)[level] ?? level)}
                            </button>
                        ))}
                    </div>

                    {/* Resource balance table */}
                    <div className='border rounded-lg overflow-auto'>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Resource</TableHead>
                                    <TableHead className='text-right'>Produced/tick</TableHead>
                                    <TableHead className='text-right'>Used/tick</TableHead>
                                    <TableHead className='text-right'>Pop. demand/tick</TableHead>
                                    <TableHead className='text-right font-semibold'>Balance/tick</TableHead>
                                    <TableHead>Sources</TableHead>
                                    <TableHead>Consumers</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredResources.map((r) => (
                                    <TableRow
                                        key={r.resourceName}
                                        className={
                                            !r.isExternalSource && r.balance < -0.001
                                                ? 'bg-red-50 dark:bg-red-950/20'
                                                : !r.isExternalSource && r.balance > 0.001 && r.producedPerTick > 0
                                                  ? 'bg-green-50 dark:bg-green-950/20'
                                                  : ''
                                        }
                                    >
                                        <TableCell>
                                            <div className='flex items-center gap-2'>
                                                <span
                                                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${LEVEL_BADGE[r.resourceLevel] ?? 'bg-gray-200'}`}
                                                >
                                                    {r.resourceLevel}
                                                </span>
                                                <span className='font-medium text-sm'>{r.resourceName}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className='text-right font-mono text-sm'>
                                            {r.isExternalSource ? '∞' : fmt(r.producedPerTick)}
                                        </TableCell>
                                        <TableCell className='text-right font-mono text-sm'>
                                            {r.consumedByFacilitiesPerTick > 0
                                                ? fmt(r.consumedByFacilitiesPerTick)
                                                : '—'}
                                        </TableCell>
                                        <TableCell className='text-right font-mono text-sm'>
                                            {r.populationDemandPerTick > 0 ? fmt(r.populationDemandPerTick) : '—'}
                                        </TableCell>
                                        <TableCell className='text-right'>
                                            {r.isExternalSource ? (
                                                <span className='text-muted-foreground text-xs'>—</span>
                                            ) : (
                                                <span
                                                    className={`font-mono text-sm font-semibold ${
                                                        r.balance < -0.001
                                                            ? 'text-red-600'
                                                            : r.balance > 0.001
                                                              ? 'text-green-600'
                                                              : 'text-muted-foreground'
                                                    }`}
                                                >
                                                    {r.balance >= 0 ? '+' : ''}
                                                    {fmt(r.balance)}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <FacilityListTooltip names={r.producedBy} label='source' />
                                        </TableCell>
                                        <TableCell>
                                            <FacilityListTooltip names={r.consumedBy} label='consumer' />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                {/* ── FACILITIES ── */}
                <TabsContent value='facilities' className='mt-4 space-y-8'>
                    {(['raw', 'refined', 'manufactured', 'services'] as const).map((level) => (
                        <div key={level}>
                            <h3 className='text-base font-semibold mb-3 flex items-center gap-2'>
                                <span
                                    className={`inline-block px-2 py-0.5 rounded text-sm font-medium ${LEVEL_BADGE[level]}`}
                                >
                                    {FACILITY_LEVEL_LABELS[level]}
                                </span>
                            </h3>
                            <div className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
                                {(facilitiesByLevel[level] ?? []).map((f) => (
                                    <FacilityCard
                                        key={f.name}
                                        facility={f}
                                        scale={scales[f.name] ?? 0}
                                        onScale={(val) => setScale(f.name, val)}
                                        balanceByName={balanceByName}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </TabsContent>

                {/* ── GRAPH ── */}
                <TabsContent value='graph' className='mt-4'>
                    <DependencyGraph scales={scales} facilities={balance.facilities} balanceByName={balanceByName} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

// ─── FacilityListTooltip ──────────────────────────────────────────────────────

function FacilityListTooltip({ names, label }: { names: string[]; label: string }) {
    if (names.length === 0) {
        return <span className='text-muted-foreground text-xs'>—</span>;
    }
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className='text-xs text-muted-foreground cursor-help underline decoration-dotted'>
                        {names.length} {label}
                        {names.length !== 1 ? 's' : ''}
                    </span>
                </TooltipTrigger>
                <TooltipContent>
                    <div className='space-y-0.5 max-h-48 overflow-auto'>
                        {names.map((n) => (
                            <div key={n} className='text-xs'>
                                {n}
                            </div>
                        ))}
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
