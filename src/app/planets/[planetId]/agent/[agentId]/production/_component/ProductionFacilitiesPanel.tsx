'use client';

import React, { useMemo, useState } from 'react';
import type { ProductionFacility, LastProductionTickResults } from '../../../../../../../simulation/planet/facility';
import type { EducationLevelType } from '@/simulation/population/education';
import { educationLevels } from '@/simulation/population/education';
import { formatNumbers } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { FacilityIcon } from '@/components/client/FacilityIcon';
import { ProductIcon } from '@/components/client/ProductIcon';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    FACILITY_LEVELS,
    FACILITY_LEVEL_LABELS,
    facilitiesByLevel,
    type FacilityCatalogEntry,
} from '@/simulation/planet/productionFacilities';
import { calculateCostsForConstruction, getFacilityType } from '@/simulation/planet/facility';
import { ChevronDown, ChevronUp, HardHat, Zap, Users } from 'lucide-react';

const MAX_SCALE = 100;
const PLACEHOLDER_PLANET = 'catalog';
const PLACEHOLDER_ID = 'preview';

const eduLabel = (edu: EducationLevelType): string => educationLevels[edu].name;

const efficiencyColor = (frac: number): string => {
    if (frac >= 0.9) {
        return 'text-green-600';
    }
    if (frac >= 0.5) {
        return 'text-amber-500';
    }
    return 'text-red-500';
};
const pctStr = (frac: number): string => `${Math.round(frac * 100)}%`;

// ---------------------------------------------------------------------------
// Scale selector (slider + number input)
// ---------------------------------------------------------------------------
function ScaleSelector({
    value,
    min,
    onChange,
}: {
    value: number;
    min: number;
    onChange: (v: number) => void;
}): React.ReactElement {
    return (
        <div className='flex items-center gap-2'>
            <Slider
                min={min}
                max={MAX_SCALE}
                step={1}
                value={[value]}
                onValueChange={([v]) => onChange(v)}
                className='flex-1'
            />
            <Input
                type='number'
                min={min}
                max={MAX_SCALE}
                value={value}
                onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n)) {
                        onChange(Math.max(min, Math.min(MAX_SCALE, n)));
                    }
                }}
                className='w-16 text-center tabular-nums'
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Efficiency breakdown (collapsible)
// ---------------------------------------------------------------------------
function EfficiencyDetails({ results }: { results: LastProductionTickResults }): React.ReactElement {
    const [open, setOpen] = useState(false);
    const workerEntries = Object.entries(results.workerEfficiency) as [EducationLevelType, number][];
    const resourceEntries = Object.entries(results.resourceEfficiency);
    const overqualifiedEntries = Object.entries(results.overqualifiedWorkers) as [
        EducationLevelType,
        { [workerEdu in EducationLevelType]?: number } | undefined,
    ][];
    const hasOverqualified = overqualifiedEntries.some(
        ([, breakdown]) => breakdown && Object.values(breakdown).some((v) => v && v > 0),
    );

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className='flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors'>
                {open ? <ChevronUp className='h-3 w-3' /> : <ChevronDown className='h-3 w-3' />}
                Efficiency details
            </CollapsibleTrigger>
            <CollapsibleContent className='mt-1 space-y-1 text-xs ml-1'>
                {workerEntries.length > 0 && (
                    <div>
                        <span className='text-muted-foreground'>Workers: </span>
                        <span className='flex flex-wrap gap-x-3 mt-0.5 ml-2'>
                            {workerEntries.map(([edu, eff]) => (
                                <span key={edu}>
                                    <span className='text-muted-foreground'>{eduLabel(edu)}: </span>
                                    <span className={efficiencyColor(eff)}>{pctStr(eff)}</span>
                                </span>
                            ))}
                        </span>
                    </div>
                )}
                {resourceEntries.length > 0 && (
                    <div>
                        <span className='text-muted-foreground'>Resources: </span>
                        <span className='flex flex-wrap gap-x-3 mt-0.5 ml-2'>
                            {resourceEntries.map(([name, eff]) => (
                                <span key={name}>
                                    <span className='text-muted-foreground'>{name}: </span>
                                    <span className={efficiencyColor(eff)}>{pctStr(eff)}</span>
                                </span>
                            ))}
                        </span>
                    </div>
                )}
                {hasOverqualified && (
                    <div>
                        <span className='text-muted-foreground'>Overqualified: </span>
                        {overqualifiedEntries.map(([jobEdu, breakdown]) => {
                            if (!breakdown) {
                                return null;
                            }
                            const parts = (
                                Object.entries(breakdown) as [EducationLevelType, number | undefined][]
                            ).filter(([, v]) => v && v > 0);
                            if (!parts.length) {
                                return null;
                            }
                            return (
                                <span key={jobEdu} className='ml-2'>
                                    <span className='text-muted-foreground'>{eduLabel(jobEdu)}: </span>
                                    {parts.map(([wEdu, count]) => (
                                        <span key={wEdu} className='mr-1 text-amber-500'>
                                            {eduLabel(wEdu)} ×{count}
                                        </span>
                                    ))}
                                </span>
                            );
                        })}
                    </div>
                )}
            </CollapsibleContent>
        </Collapsible>
    );
}

// ---------------------------------------------------------------------------
// Under Construction card
// ---------------------------------------------------------------------------
function UnderConstructionCard({ facility }: { facility: ProductionFacility }): React.ReactElement {
    const cs = facility.construction!;
    const pct =
        cs.totalConstructionServiceRequired > 0
            ? Math.min(100, (cs.progress / cs.totalConstructionServiceRequired) * 100)
            : 0;
    const remaining = Math.max(0, cs.totalConstructionServiceRequired - cs.progress);
    const ticksEst =
        cs.maximumConstructionServiceConsumption > 0
            ? Math.ceil(remaining / cs.maximumConstructionServiceConsumption)
            : '?';

    return (
        <Card className='overflow-hidden'>
            <CardHeader className='p-3 pb-2'>
                <div className='flex items-start gap-3'>
                    <div className='relative shrink-0'>
                        <FacilityIcon facilityName={facility.name} variant='constructed' />
                        <div className='absolute inset-0 bg-background/50 rounded' />
                    </div>
                    <div className='flex-1 min-w-0'>
                        <div className='flex items-center gap-2 flex-wrap'>
                            <h3 className='font-semibold text-sm leading-tight'>{facility.name}</h3>
                            <Badge
                                variant='secondary'
                                className='text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 text-[10px] px-1.5 py-0 gap-1'
                            >
                                <HardHat className='h-2.5 w-2.5' />
                                Under Construction
                            </Badge>
                        </div>
                        <p className='text-xs text-muted-foreground mt-0.5'>
                            Scale {facility.scale} →{' '}
                            <span className='font-medium text-foreground'>{cs.constructionTargetMaxScale}</span>
                        </p>
                    </div>
                </div>
            </CardHeader>
            <CardContent className='px-3 pb-3 space-y-2'>
                <div>
                    <div className='flex justify-between text-xs text-muted-foreground mb-1'>
                        <span>Construction progress</span>
                        <span className='tabular-nums font-medium text-foreground'>{pct.toFixed(1)}%</span>
                    </div>
                    <Progress value={pct} className='h-2.5 bg-amber-100 dark:bg-amber-950/40 [&>div]:bg-amber-500' />
                </div>
                <div className='grid grid-cols-3 gap-2 text-xs'>
                    <div className='rounded bg-muted px-2 py-1'>
                        <div className='text-muted-foreground'>Last tick</div>
                        <div className='tabular-nums font-medium'>
                            {formatNumbers(cs.lastTickInvestedConstructionServices)} cs
                        </div>
                    </div>
                    <div className='rounded bg-muted px-2 py-1'>
                        <div className='text-muted-foreground'>Max / tick</div>
                        <div className='tabular-nums font-medium'>
                            {formatNumbers(cs.maximumConstructionServiceConsumption)} cs
                        </div>
                    </div>
                    <div className='rounded bg-muted px-2 py-1'>
                        <div className='text-muted-foreground'>Est. ticks</div>
                        <div className='tabular-nums font-medium text-amber-600'>{ticksEst}</div>
                    </div>
                </div>
                <p className='text-xs text-muted-foreground'>
                    Remaining: <span className='tabular-nums'>{formatNumbers(remaining)}</span> /{' '}
                    {formatNumbers(cs.totalConstructionServiceRequired)} construction services
                </p>
            </CardContent>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Active facility card
// ---------------------------------------------------------------------------
function ActiveFacilityCard({
    facility,
    agentId,
    planetId,
    onExpanded,
}: {
    facility: ProductionFacility;
    agentId: string;
    planetId: string;
    onExpanded: () => void;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [targetScale, setTargetScale] = useState(facility.maxScale + 1);
    const [showExpand, setShowExpand] = useState(false);

    const expandMutation = useMutation(
        trpc.expandFacility.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getAgentPlanetDetail.queryKey({ agentId, planetId }),
                });
                setShowExpand(false);
                onExpanded();
            },
        }),
    );

    const facilityType = useMemo(() => getFacilityType(facility), [facility]);
    const expandCost = useMemo(
        () => calculateCostsForConstruction(facilityType, facility.maxScale, targetScale),
        [facilityType, facility.maxScale, targetScale],
    );

    const totalWorkers = Object.entries(facility.workerRequirement)
        .filter(([, v]) => v && v > 0)
        .reduce((sum, [, v]) => sum + (v ?? 0) * facility.scale, 0);

    const eff = facility.lastTickResults?.overallEfficiency ?? 0;

    return (
        <Card className='overflow-hidden'>
            <CardHeader className='p-3 pb-2'>
                <div className='flex items-start gap-3'>
                    <FacilityIcon facilityName={facility.name} />
                    <div className='flex-1 min-w-0'>
                        <div className='flex items-center gap-2 flex-wrap'>
                            <h3 className='font-semibold text-sm leading-tight'>{facility.name}</h3>
                            <Badge variant='outline' className='text-[10px] px-1.5 py-0'>
                                Scale {facility.maxScale}
                            </Badge>
                            <Badge variant='secondary' className={`text-[10px] px-1.5 py-0 ${efficiencyColor(eff)}`}>
                                {pctStr(eff)} eff.
                            </Badge>
                        </div>
                        <div className='flex items-center gap-3 mt-1 text-xs text-muted-foreground'>
                            {totalWorkers > 0 && (
                                <span className='flex items-center gap-1'>
                                    <Users className='h-3 w-3' />
                                    {formatNumbers(totalWorkers)}
                                </span>
                            )}
                            {facility.powerConsumptionPerTick !== 0 && (
                                <span className='flex items-center gap-1'>
                                    <Zap className='h-3 w-3' />
                                    {facility.powerConsumptionPerTick > 0
                                        ? `${facility.powerConsumptionPerTick} MW`
                                        : 'produces power'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className='px-3 pb-3 space-y-2'>
                {facility.needs.length > 0 && (
                    <div>
                        <p className='text-xs text-muted-foreground font-medium mb-1'>Needs</p>
                        <div className='flex flex-wrap gap-1.5'>
                            {facility.needs.map(({ resource, quantity }) => (
                                <span
                                    key={resource.name}
                                    className='inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs'
                                >
                                    <ProductIcon productName={resource.name} />
                                    {formatNumbers(quantity * facility.scale)}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
                {facility.produces.length > 0 && (
                    <div>
                        <p className='text-xs text-muted-foreground font-medium mb-1'>Produces</p>
                        <div className='flex flex-wrap gap-1.5'>
                            {facility.produces.map(({ resource, quantity }) => (
                                <span
                                    key={resource.name}
                                    className='inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary'
                                >
                                    <ProductIcon productName={resource.name} />
                                    {formatNumbers(quantity * facility.scale)}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {facility.lastTickResults && <EfficiencyDetails results={facility.lastTickResults} />}

                <Separator />

                {showExpand ? (
                    <div className='space-y-2'>
                        <p className='text-xs font-medium'>Expand to scale</p>
                        <ScaleSelector
                            value={targetScale}
                            min={facility.maxScale + 1}
                            onChange={(v) => setTargetScale(v)}
                        />
                        <p className='text-xs text-muted-foreground'>
                            Construction cost:{' '}
                            <span className='tabular-nums font-medium text-foreground'>
                                {formatNumbers(expandCost)}
                            </span>{' '}
                            construction services
                        </p>
                        <div className='flex gap-2'>
                            <Button
                                size='sm'
                                variant='outline'
                                className='flex-1 text-xs'
                                onClick={() => setShowExpand(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                size='sm'
                                className='flex-1 text-xs'
                                disabled={expandMutation.isPending}
                                onClick={() =>
                                    expandMutation.mutate({ agentId, planetId, facilityId: facility.id, targetScale })
                                }
                            >
                                {expandMutation.isPending ? 'Expanding…' : 'Confirm Expand'}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button
                        variant='outline'
                        size='sm'
                        className='w-full text-xs gap-1'
                        onClick={() => {
                            setTargetScale(facility.maxScale + 1);
                            setShowExpand(true);
                        }}
                    >
                        Expand facility
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Catalog card (not-yet-built facility)
// ---------------------------------------------------------------------------
function CatalogCard({
    entry,
    agentId,
    planetId,
    onBuilt,
}: {
    entry: FacilityCatalogEntry;
    agentId: string;
    planetId: string;
    onBuilt: () => void;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const facility = useMemo(() => entry.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID), [entry]);
    const facilityType = useMemo(() => getFacilityType(facility), [facility]);

    const [targetScale, setTargetScale] = useState(1);

    const buildCost = useMemo(
        () => calculateCostsForConstruction(facilityType, 0, targetScale),
        [facilityType, targetScale],
    );

    const totalWorkers = Object.values(facility.workerRequirement).reduce((s, v) => s + (v ?? 0), 0);

    const buildMutation = useMutation(
        trpc.buildFacility.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getAgentPlanetDetail.queryKey({ agentId, planetId }),
                });
                onBuilt();
            },
        }),
    );

    return (
        <Card className='overflow-hidden opacity-80 hover:opacity-100 transition-opacity'>
            <CardHeader className='p-3 pb-2'>
                <div className='flex items-start gap-3'>
                    <FacilityIcon facilityName={facility.name} />
                    <div className='flex-1 min-w-0'>
                        <h3 className='font-semibold text-sm leading-tight'>{facility.name}</h3>
                        <div className='flex items-center gap-3 mt-1 text-xs text-muted-foreground'>
                            {totalWorkers > 0 && (
                                <span className='flex items-center gap-1'>
                                    <Users className='h-3 w-3' />
                                    {formatNumbers(totalWorkers)} / scale
                                </span>
                            )}
                            {facility.powerConsumptionPerTick !== 0 && (
                                <span className='flex items-center gap-1'>
                                    <Zap className='h-3 w-3' />
                                    {facility.powerConsumptionPerTick > 0
                                        ? `${facility.powerConsumptionPerTick} MW`
                                        : 'produces power'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className='px-3 pb-3 space-y-2'>
                {facility.needs.length > 0 && (
                    <div>
                        <p className='text-xs text-muted-foreground font-medium mb-1'>Needs</p>
                        <div className='flex flex-wrap gap-1.5'>
                            {facility.needs.map(({ resource, quantity }) => (
                                <span
                                    key={resource.name}
                                    className='inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs'
                                >
                                    <ProductIcon productName={resource.name} />
                                    {formatNumbers(quantity)}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
                {facility.produces.length > 0 && (
                    <div>
                        <p className='text-xs text-muted-foreground font-medium mb-1'>Produces</p>
                        <div className='flex flex-wrap gap-1.5'>
                            {facility.produces.map(({ resource, quantity }) => (
                                <span
                                    key={resource.name}
                                    className='inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary'
                                >
                                    <ProductIcon productName={resource.name} />
                                    {formatNumbers(quantity)}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
                <Separator />
                <div className='space-y-2'>
                    <div className='flex items-center justify-between'>
                        <p className='text-xs font-medium'>Target scale</p>
                    </div>
                    <ScaleSelector value={targetScale} min={1} onChange={setTargetScale} />
                    <p className='text-xs text-muted-foreground'>
                        Construction cost:{' '}
                        <span className='tabular-nums font-medium text-foreground'>{formatNumbers(buildCost)}</span>{' '}
                        construction services
                    </p>
                    <Button
                        size='sm'
                        variant='outline'
                        className='w-full text-xs'
                        disabled={buildMutation.isPending}
                        onClick={() =>
                            buildMutation.mutate({ agentId, planetId, facilityKey: facility.name, targetScale })
                        }
                    >
                        {buildMutation.isPending ? 'Building…' : 'Build'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------
export default function ProductionFacilitiesPanel({
    facilities,
    agentId,
    planetId,
}: {
    facilities: ProductionFacility[];
    agentId: string;
    planetId: string;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const refresh = () =>
        void queryClient.invalidateQueries({
            queryKey: trpc.simulation.getAgentPlanetDetail.queryKey({ agentId, planetId }),
        });

    // Build a lookup from facility name → owned facility
    const ownedByName = useMemo(() => {
        const m = new Map<string, ProductionFacility>();
        for (const f of facilities) {
            m.set(f.name, f);
        }
        return m;
    }, [facilities]);

    const activeCount = facilities.filter((f) => f.construction === null).length;
    const constructionCount = facilities.filter((f) => f.construction !== null).length;

    return (
        <div className='space-y-4'>
            {/* Under Construction banner */}
            {constructionCount > 0 && (
                <div>
                    <div className='flex items-center gap-2 mb-2'>
                        <HardHat className='h-4 w-4 text-amber-500' />
                        <h2 className='text-sm font-semibold'>Under Construction</h2>
                        <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
                            {constructionCount}
                        </Badge>
                    </div>
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                        {facilities
                            .filter((f) => f.construction !== null)
                            .map((f) => (
                                <UnderConstructionCard key={f.id} facility={f} />
                            ))}
                    </div>
                </div>
            )}

            {/* Facility catalog tabs */}
            <Tabs defaultValue='raw'>
                <div className='flex items-center justify-between mb-1'>
                    <h2 className='text-sm font-semibold'>
                        Facilities
                        {activeCount > 0 && (
                            <Badge variant='secondary' className='ml-2 text-[10px] px-1.5 py-0'>
                                {activeCount} active
                            </Badge>
                        )}
                    </h2>
                </div>
                <TabsList className='w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0 border-b border-border pb-2'>
                    {FACILITY_LEVELS.map((level) => {
                        const levelFacilities = facilitiesByLevel[level];
                        const ownedActive = levelFacilities.filter((e) => {
                            const f = ownedByName.get(e.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name);
                            return f && f.construction === null;
                        }).length;
                        const ownedTotal = levelFacilities.filter((e) =>
                            ownedByName.has(e.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name),
                        ).length;
                        return (
                            <TabsTrigger
                                key={level}
                                value={level}
                                className='data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                            >
                                {FACILITY_LEVEL_LABELS[level]}
                                {ownedTotal > 0 && (
                                    <Badge variant='secondary' className='ml-1.5 text-[10px] px-1 py-0'>
                                        {ownedActive}/{levelFacilities.length}
                                    </Badge>
                                )}
                            </TabsTrigger>
                        );
                    })}
                </TabsList>
                {FACILITY_LEVELS.map((level) => (
                    <TabsContent key={level} value={level} className='mt-3'>
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                            {facilitiesByLevel[level].map((entry) => {
                                const previewName = entry.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name;
                                const owned = ownedByName.get(previewName);
                                if (owned) {
                                    if (owned.construction !== null) {
                                        // Already shown in under-construction section, but also show here
                                        return <UnderConstructionCard key={owned.id} facility={owned} />;
                                    }
                                    return (
                                        <ActiveFacilityCard
                                            key={owned.id}
                                            facility={owned}
                                            agentId={agentId}
                                            planetId={planetId}
                                            onExpanded={refresh}
                                        />
                                    );
                                }
                                return (
                                    <CatalogCard
                                        key={previewName}
                                        entry={entry}
                                        agentId={agentId}
                                        planetId={planetId}
                                        onBuilt={refresh}
                                    />
                                );
                            })}
                        </div>
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
