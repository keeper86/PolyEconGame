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
import { Checkbox } from '@/components/ui/checkbox';
import { computeSupplyChainBalance, type FacilityInfo, type ResourceBalance } from './computeBalance';
import DependencyGraph from './DependencyGraph';
import { ALL_FACILITY_ENTRIES, FACILITY_LEVEL_LABELS, FACILITY_LEVELS } from '@/simulation/planet/facilities';
import { solveSupplyChain, type SolverObjective, type SolverResult } from './solver';
import { computeBottlenecks } from './bottleneck';
import { LiveStateTab } from './LiveStateTab';

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

// ─── BottleneckPanel ─────────────────────────────────────────────────────────

function CoverageBar({ ratio }: { ratio: number }) {
    const pct = Math.min(100, ratio * 100);
    const color = ratio >= 1 ? 'bg-green-500' : ratio >= 0.7 ? 'bg-amber-500' : 'bg-red-500';
    return (
        <div className='flex items-center gap-2'>
            <div className='flex-1 bg-muted rounded-full h-1.5 overflow-hidden'>
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span
                className={`font-mono text-xs w-12 text-right ${
                    ratio >= 1 ? 'text-green-600' : ratio >= 0.7 ? 'text-amber-600' : 'text-red-600'
                }`}
            >
                {ratio === Infinity ? '∞' : `${Math.round(pct)}%`}
            </span>
        </div>
    );
}

function BottleneckPanel({
    balance,
    scales,
    population,
}: {
    balance: ReturnType<typeof computeSupplyChainBalance>;
    scales: Record<string, number>;
    population: number;
}) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const reports = useMemo(() => computeBottlenecks(balance, scales, population), [balance, scales, population]);

    if (population <= 0) {
        return null;
    }

    function toggleExpand(name: string) {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(name)) {
                next.delete(name);
            } else {
                next.add(name);
            }
            return next;
        });
    }

    return (
        <Card>
            <CardHeader className='pb-2 pt-3 px-4'>
                <CardTitle className='text-sm font-semibold'>Bottleneck Detection</CardTitle>
            </CardHeader>
            <CardContent className='px-4 pb-3 space-y-1'>
                {reports.map((r) => (
                    <div key={r.serviceResource} className='space-y-1'>
                        <button
                            className='w-full text-left'
                            onClick={() => {
                                if (r.limitingInputs.length > 0) {
                                    toggleExpand(r.serviceResource);
                                }
                            }}
                        >
                            <div className='flex items-center gap-2'>
                                <span className='text-xs font-medium w-44 shrink-0 truncate'>{r.serviceResource}</span>
                                <div className='flex-1'>
                                    <CoverageBar ratio={r.coverageRatio} />
                                </div>
                                <span className='text-[10px] text-muted-foreground w-20 text-right shrink-0'>
                                    {fmt(r.supplyPerTick)}&nbsp;/&nbsp;{fmt(r.demandPerTick)}&nbsp;/t
                                </span>
                                {r.limitingInputs.length > 0 && (
                                    <span className='text-muted-foreground text-xs w-3'>
                                        {expanded.has(r.serviceResource) ? '▲' : '▼'}
                                    </span>
                                )}
                            </div>
                        </button>

                        {expanded.has(r.serviceResource) && r.limitingInputs.length > 0 && (
                            <div className='ml-4 space-y-0.5 border-l pl-3'>
                                {r.limitingInputs.map((inp, idx) => (
                                    <div key={inp.resourceName} className='flex items-center gap-2'>
                                        <span
                                            className={`text-[11px] w-40 truncate ${
                                                idx === 0 && inp.coverageRatio < 1 ? 'font-semibold text-red-600' : ''
                                            }`}
                                        >
                                            {inp.resourceName}
                                        </span>
                                        <div className='flex-1'>
                                            <CoverageBar
                                                ratio={inp.coverageRatio === Infinity ? 1 : inp.coverageRatio}
                                            />
                                        </div>
                                        <span className='text-[10px] text-muted-foreground w-24 text-right shrink-0'>
                                            {inp.availablePerTick === Infinity ? '∞' : fmt(inp.availablePerTick)}
                                            &nbsp;/&nbsp;{fmt(inp.requiredPerTick)}&nbsp;/t
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

// ─── SolverTab ────────────────────────────────────────────────────────────────

const OBJECTIVE_LABELS: Record<SolverObjective, string> = {
    scale: 'Minimise Total Scale',
    labor: 'Minimise Total Workers',
    power: 'Minimise Power Consumption',
};

function SolverTab({
    population,
    onApplyScales,
}: {
    population: number;
    onApplyScales: (scales: Record<string, number>) => void;
}) {
    // Build initial allowed-facilities set (all enabled by default)
    const allFacilityNames = useMemo(() => ALL_FACILITY_ENTRIES.map((e) => e.factory('tool', 'preview').name), []);
    const [allowed, setAllowed] = useState<Set<string>>(() => new Set(allFacilityNames));
    const [objective, setObjective] = useState<SolverObjective>('scale');
    const [solving, setSolving] = useState(false);
    const [result, setResult] = useState<SolverResult | null>(null);

    // Group facilities by primary output level for the checkbox UI
    const facilitiesByLevel = useMemo(() => {
        const grouped: Record<string, string[]> = {};
        for (const entry of ALL_FACILITY_ENTRIES) {
            const name = entry.factory('tool', 'preview').name;
            const level = entry.primaryOutputLevel;
            if (!grouped[level]) {
                grouped[level] = [];
            }
            grouped[level].push(name);
        }
        return grouped;
    }, []);

    function toggleFacility(name: string) {
        setAllowed((prev) => {
            const next = new Set(prev);
            if (next.has(name)) {
                next.delete(name);
            } else {
                next.add(name);
            }
            return next;
        });
    }

    function toggleLevel(level: string, enable: boolean) {
        setAllowed((prev) => {
            const next = new Set(prev);
            for (const name of facilitiesByLevel[level] ?? []) {
                if (enable) {
                    next.add(name);
                } else {
                    next.delete(name);
                }
            }
            return next;
        });
    }

    function handleSolve() {
        setSolving(true);
        setResult(null);
        // Defer to next tick so React re-renders the loading state first
        setTimeout(() => {
            try {
                const res = solveSupplyChain({ population, allowedFacilities: allowed, objective });
                setResult(res);
            } finally {
                setSolving(false);
            }
        }, 0);
    }

    const resultFacilities = result
        ? ALL_FACILITY_ENTRIES.map((e) => {
              const f = e.factory('tool', 'preview');
              return { name: f.name, scale: result.scales[f.name] ?? 0, facility: f };
          }).filter((x) => x.scale > 0)
        : [];

    return (
        <div className='space-y-6'>
            {/* Objective selector */}
            <div className='space-y-2'>
                <Label className='font-semibold'>Objective</Label>
                <div className='flex flex-wrap gap-2'>
                    {(['scale', 'labor', 'power'] as const).map((obj) => (
                        <button
                            key={obj}
                            onClick={() => setObjective(obj)}
                            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                                objective === obj
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'border-border hover:bg-muted'
                            }`}
                        >
                            {OBJECTIVE_LABELS[obj]}
                        </button>
                    ))}
                </div>
            </div>

            {/* Allowed facilities */}
            <div className='space-y-3'>
                <Label className='font-semibold'>Allowed Facilities</Label>
                {([...FACILITY_LEVELS, 'source'] as const).map((level) => {
                    const names = facilitiesByLevel[level];
                    if (!names || names.length === 0) {
                        return null;
                    }
                    const allOn = names.every((n) => allowed.has(n));
                    const allOff = names.every((n) => !allowed.has(n));
                    return (
                        <div key={level} className='space-y-1.5'>
                            <div className='flex items-center gap-2'>
                                <span
                                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                        LEVEL_BADGE[level] ?? 'bg-gray-200'
                                    }`}
                                >
                                    {(FACILITY_LEVEL_LABELS as Record<string, string>)[level] ?? level}
                                </span>
                                <button
                                    className='text-[11px] text-primary underline'
                                    onClick={() => toggleLevel(level, true)}
                                    disabled={allOn}
                                >
                                    All
                                </button>
                                <button
                                    className='text-[11px] text-primary underline'
                                    onClick={() => toggleLevel(level, false)}
                                    disabled={allOff}
                                >
                                    None
                                </button>
                            </div>
                            <div className='flex flex-wrap gap-x-4 gap-y-1 pl-2'>
                                {names.map((name) => (
                                    <label key={name} className='flex items-center gap-1.5 text-sm cursor-pointer'>
                                        <Checkbox
                                            checked={allowed.has(name)}
                                            onCheckedChange={() => toggleFacility(name)}
                                        />
                                        {name}
                                    </label>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Solve button */}
            <Button onClick={handleSolve} disabled={solving || population <= 0}>
                {solving ? 'Solving…' : 'Solve'}
            </Button>
            {population <= 0 && <p className='text-sm text-muted-foreground'>Set a population above 0 to solve.</p>}

            {/* Results */}
            {result && (
                <div className='space-y-4'>
                    {result.status === 'infeasible' ? (
                        <div className='space-y-3'>
                            <Card className='border-red-300 bg-red-50/50 dark:bg-red-950/20'>
                                <CardContent className='px-4 py-3'>
                                    <p className='text-sm font-semibold text-red-600'>⚠ No feasible solution found</p>
                                    <p className='text-xs text-muted-foreground mt-1'>
                                        The LP solver could not satisfy all constraints simultaneously. See diagnostics
                                        below.
                                    </p>
                                </CardContent>
                            </Card>

                            {result.diagnostic && (
                                <Card>
                                    <CardHeader className='pb-2 pt-3 px-4'>
                                        <CardTitle className='text-sm'>Infeasibility Diagnostics</CardTitle>
                                    </CardHeader>
                                    <CardContent className='px-4 pb-3 space-y-4 text-sm'>
                                        {/* Power constraint check */}
                                        <div>
                                            <p className='font-medium mb-1'>Power constraint</p>
                                            {result.diagnostic.feasibleWithoutPower ? (
                                                <p className='text-amber-700 text-xs'>
                                                    ✓ Feasible when power constraint is removed →{' '}
                                                    <strong>power balance is blocking the solution.</strong> You need a
                                                    Coal Power Plant (or other power producer) in the allowed
                                                    facilities.
                                                </p>
                                            ) : (
                                                <p className='text-xs text-muted-foreground'>
                                                    Still infeasible without power constraint — power is not the root
                                                    cause.
                                                </p>
                                            )}
                                        </div>

                                        {/* Per-service breakdown */}
                                        <div>
                                            <p className='font-medium mb-1'>Service constraints</p>
                                            <div className='space-y-1'>
                                                {result.diagnostic.per_service.map((s) => {
                                                    const ok =
                                                        s.feasibleInIsolation &&
                                                        s.hasProducer &&
                                                        s.constraintRegistered;
                                                    return (
                                                        <div
                                                            key={s.serviceName}
                                                            className={`flex flex-wrap items-start gap-x-3 gap-y-0.5 text-xs rounded px-2 py-1 ${ok ? 'bg-green-50 dark:bg-green-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}
                                                        >
                                                            <span className='font-medium w-44'>{s.serviceName}</span>
                                                            <span
                                                                className={
                                                                    s.hasProducer ? 'text-green-700' : 'text-red-600'
                                                                }
                                                            >
                                                                {s.hasProducer
                                                                    ? '✓ has producer'
                                                                    : '✗ NO producer in allowed facilities'}
                                                            </span>
                                                            <span
                                                                className={
                                                                    s.constraintRegistered
                                                                        ? 'text-green-700'
                                                                        : 'text-amber-600'
                                                                }
                                                            >
                                                                {s.constraintRegistered
                                                                    ? '✓ constraint registered'
                                                                    : '⚠ constraint NOT in model'}
                                                            </span>
                                                            <span
                                                                className={
                                                                    s.feasibleInIsolation
                                                                        ? 'text-green-700'
                                                                        : 'text-red-600'
                                                                }
                                                            >
                                                                {s.feasibleInIsolation
                                                                    ? '✓ feasible alone'
                                                                    : '✗ infeasible even alone'}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Unproducable resources */}
                                        {result.diagnostic.unproducableResources.length > 0 && (
                                            <div>
                                                <p className='font-medium mb-1 text-red-700'>
                                                    Resources with no producer in allowed facilities
                                                </p>
                                                <div className='flex flex-wrap gap-1'>
                                                    {result.diagnostic.unproducableResources.map((r) => (
                                                        <span
                                                            key={r}
                                                            className='bg-red-100 dark:bg-red-900/30 border border-red-300 rounded px-1.5 py-0.5 text-xs text-red-700'
                                                        >
                                                            {r}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Service coverage summary */}
                            <Card>
                                <CardHeader className='pb-2 pt-3 px-4'>
                                    <CardTitle className='text-sm'>Service Coverage</CardTitle>
                                </CardHeader>
                                <CardContent className='px-4 pb-3 space-y-1'>
                                    {Object.entries(result.serviceCoverage).map(([svc, ratio]) => (
                                        <div key={svc} className='flex items-center gap-2'>
                                            <span className='text-xs w-44 shrink-0 truncate'>{svc}</span>
                                            <div className='flex-1'>
                                                <CoverageBar ratio={ratio} />
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>

                            {/* Facility scale table */}
                            <div className='space-y-2'>
                                <div className='flex items-center justify-between'>
                                    <Label className='font-semibold'>
                                        Recommended Scales ({resultFacilities.length} facilities)
                                    </Label>
                                    <Button size='sm' onClick={() => onApplyScales(result.scales)}>
                                        Apply Scales
                                    </Button>
                                </div>
                                <div className='border rounded-lg overflow-auto'>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Facility</TableHead>
                                                <TableHead className='text-right'>Scale</TableHead>
                                                <TableHead className='text-right'>Workers</TableHead>
                                                <TableHead className='text-right'>Power/tick</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {resultFacilities.map(({ name, scale, facility }) => {
                                                const workers =
                                                    ((facility.workerRequirement.none ?? 0) +
                                                        (facility.workerRequirement.primary ?? 0) +
                                                        (facility.workerRequirement.secondary ?? 0) +
                                                        (facility.workerRequirement.tertiary ?? 0)) *
                                                    scale;
                                                return (
                                                    <TableRow key={name}>
                                                        <TableCell className='text-sm'>{name}</TableCell>
                                                        <TableCell className='text-right font-mono text-sm'>
                                                            {scale.toFixed(2)}
                                                        </TableCell>
                                                        <TableCell className='text-right font-mono text-sm'>
                                                            {fmt(workers)}
                                                        </TableCell>
                                                        <TableCell
                                                            className={`text-right font-mono text-sm ${
                                                                facility.powerConsumptionPerTick < 0
                                                                    ? 'text-green-600'
                                                                    : ''
                                                            }`}
                                                        >
                                                            {facility.powerConsumptionPerTick < 0 ? '+' : ''}
                                                            {fmt(Math.abs(facility.powerConsumptionPerTick) * scale)}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>

                                {result.workerTotals && (
                                    <Card>
                                        <CardHeader className='pb-2 pt-3 px-4'>
                                            <CardTitle className='text-sm'>Worker Totals</CardTitle>
                                        </CardHeader>
                                        <CardContent className='px-4 pb-3'>
                                            <div className='flex flex-wrap items-center gap-4'>
                                                <div className='text-sm'>
                                                    Unskilled:{' '}
                                                    <span className='font-mono'>{fmt(result.workerTotals.none)}</span>
                                                </div>
                                                <div className='text-sm'>
                                                    Primary:{' '}
                                                    <span className='font-mono'>
                                                        {fmt(result.workerTotals.primary)}
                                                    </span>
                                                </div>
                                                <div className='text-sm'>
                                                    Secondary:{' '}
                                                    <span className='font-mono'>
                                                        {fmt(result.workerTotals.secondary)}
                                                    </span>
                                                </div>
                                                <div className='text-sm'>
                                                    Tertiary:{' '}
                                                    <span className='font-mono'>
                                                        {fmt(result.workerTotals.tertiary)}
                                                    </span>
                                                </div>
                                                <div className='ml-auto text-sm font-semibold'>
                                                    Total:{' '}
                                                    <span className='font-mono'>{fmt(result.workerTotals.total)}</span>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
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
                    <TabsTrigger value='solver'>Auto-Solver</TabsTrigger>
                    <TabsTrigger value='live'>Live State</TabsTrigger>
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

                    {/* Bottleneck detection */}
                    <BottleneckPanel balance={balance} scales={scales} population={population} />

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

                {/* ── SOLVER ── */}
                <TabsContent value='solver' className='mt-4'>
                    <SolverTab population={population} onApplyScales={(newScales) => setScales(newScales)} />
                </TabsContent>

                {/* ── LIVE STATE ── */}
                <TabsContent value='live' className='mt-4'>
                    <LiveStateTab onApplyScales={(newScales) => setScales(newScales)} />
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
