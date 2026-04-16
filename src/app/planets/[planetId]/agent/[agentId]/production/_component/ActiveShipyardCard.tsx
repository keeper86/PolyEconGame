'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import { calculateCostsForConstruction } from '@/simulation/planet/facility';
import { shiptypes } from '@/simulation/ships/ships';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Anchor, Wrench } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import type { ShipyardFacility } from '../../../../../../../simulation/planet/facility';
import { FacilityCardShell } from './FacilityCardShell';
import { WorkerBars } from './WorkerBars';

const allShipTypeNames = Object.values(shiptypes).flatMap((cat) => Object.values(cat).map((t) => t.name));

export function ActiveShipyardCard({
    facility,
    agentId,
    planetId,
    constructionServicePrice,
    onExpanded,
}: {
    facility: ShipyardFacility;
    agentId: string;
    planetId: string;
    constructionServicePrice?: number;
    onExpanded: () => void;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const [targetScale, setTargetScale] = useState(facility.maxScale + 1);
    const [showExpand, setShowExpand] = useState(false);
    const [showBuildOrder, setShowBuildOrder] = useState(false);
    const [selectedShipType, setSelectedShipType] = useState(allShipTypeNames[0] ?? '');
    const [shipName, setShipName] = useState('');

    const invalidate = () =>
        void queryClient.invalidateQueries({
            queryKey: trpc.simulation.getAgentPlanetDetail.queryKey({ agentId, planetId }),
        });

    const expandMutation = useMutation(
        trpc.expandShipyard.mutationOptions({
            onSuccess: () => {
                invalidate();
                setShowExpand(false);
                onExpanded();
            },
        }),
    );

    const setModeMutation = useMutation(
        trpc.setShipyardMode.mutationOptions({
            onSuccess: () => {
                invalidate();
                setShowBuildOrder(false);
                setShipName('');
            },
        }),
    );

    const expandCost = useMemo(
        () => calculateCostsForConstruction('ships', facility.maxScale, targetScale),
        [facility.maxScale, targetScale],
    );
    const estimatedCredits =
        constructionServicePrice && constructionServicePrice > 0 ? expandCost * constructionServicePrice : null;

    const results = facility.lastTickResults;
    const eff = results?.overallEfficiency ?? 0;
    const globalMin = results
        ? Math.min(
              ...Object.values(results.resourceEfficiency),
              ...Object.values(results.workerEfficiency).filter((v): v is number => v !== undefined),
          )
        : 1;

    const modeBadge =
        facility.mode === 'idle' ? (
            <Badge variant='outline' className='text-[10px] px-1.5 py-0 text-muted-foreground'>
                Idle
            </Badge>
        ) : facility.mode === 'building' ? (
            <Badge variant='outline' className='text-[10px] px-1.5 py-0 text-blue-600 border-blue-300'>
                Building: {facility.shipName}
            </Badge>
        ) : (
            <Badge variant='outline' className='text-[10px] px-1.5 py-0 text-orange-600 border-orange-300'>
                <Wrench className='h-2.5 w-2.5 mr-1' />
                Maintenance: {facility.shipName}
            </Badge>
        );

    return (
        <FacilityCardShell
            contentClassName='flex flex-col flex-1 gap-2'
            icon={
                <div className='flex items-center justify-center w-10 h-10 rounded bg-muted shrink-0'>
                    <Anchor className='h-6 w-6 text-muted-foreground' />
                </div>
            }
            headerContent={
                <span className='flex flex-col gap-2'>
                    <div className='flex items-center gap-1 flex-col mb-auto'>
                        <h3 className='font-semibold leading-tight'>{facility.name}</h3>
                        <div className='flex gap-1 flex-wrap'>
                            <Badge variant='outline' className='text-[10px] px-1.5 py-0'>
                                Scale {facility.scale} {facility.scale === facility.maxScale ? 'max' : ''}
                            </Badge>
                            {modeBadge}
                        </div>
                    </div>
                    <WorkerBars
                        workerRequirement={facility.workerRequirement}
                        scale={facility.scale}
                        workerEfficiency={results?.workerEfficiency ?? {}}
                        globalMin={globalMin}
                    />
                </span>
            }
        >
            {/* Efficiency */}
            <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                <span>Overall efficiency</span>
                <span className='tabular-nums font-medium text-foreground'>{Math.round(eff * 100)}%</span>
            </div>

            {/* Build progress if active */}
            {(facility.mode === 'building' || facility.mode === 'maintenance') && (
                <div>
                    <div className='flex justify-between text-xs text-muted-foreground mb-1'>
                        <span>{facility.mode === 'building' ? 'Build progress' : 'Maintenance progress'}</span>
                        <span className='tabular-nums font-medium text-foreground'>
                            {Math.round(facility.progress)}%
                        </span>
                    </div>
                    <Progress value={facility.progress} className='h-2' />
                </div>
            )}

            {/* Mode controls */}
            {facility.mode === 'idle' && !showBuildOrder && !showExpand && (
                <Button size='sm' variant='outline' onClick={() => setShowBuildOrder(true)}>
                    Start build order
                </Button>
            )}

            {facility.mode === 'idle' && showBuildOrder && (
                <div className='space-y-2 rounded border p-2 text-xs'>
                    <div className='space-y-1'>
                        <Label className='text-xs'>Ship type</Label>
                        <Select value={selectedShipType} onValueChange={setSelectedShipType}>
                            <SelectTrigger className='h-7 text-xs'>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {allShipTypeNames.map((name) => (
                                    <SelectItem key={name} value={name} className='text-xs'>
                                        {name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className='space-y-1'>
                        <Label className='text-xs'>Ship name</Label>
                        <Input
                            className='h-7 text-xs'
                            placeholder='Enter a unique ship name'
                            value={shipName}
                            maxLength={50}
                            onChange={(e) => setShipName(e.target.value)}
                        />
                    </div>
                    <div className='flex gap-2'>
                        <Button
                            size='sm'
                            disabled={!shipName.trim() || setModeMutation.isPending}
                            onClick={() =>
                                setModeMutation.mutate({
                                    agentId,
                                    planetId,
                                    facilityId: facility.id,
                                    mode: 'building',
                                    shipTypeName: selectedShipType,
                                    shipName: shipName.trim(),
                                })
                            }
                        >
                            Confirm
                        </Button>
                        <Button size='sm' variant='ghost' onClick={() => setShowBuildOrder(false)}>
                            Cancel
                        </Button>
                    </div>
                    {setModeMutation.error && (
                        <p className='text-destructive text-xs'>{setModeMutation.error.message}</p>
                    )}
                </div>
            )}

            {facility.mode === 'building' && (
                <Button
                    size='sm'
                    variant='outline'
                    disabled={setModeMutation.isPending}
                    onClick={() => setModeMutation.mutate({ agentId, planetId, facilityId: facility.id, mode: 'idle' })}
                >
                    Cancel build order
                </Button>
            )}

            <Separator />

            {/* Expand section */}
            {!showExpand && (
                <Button
                    size='sm'
                    variant='ghost'
                    className='self-start text-xs'
                    onClick={() => {
                        setTargetScale(facility.maxScale + 1);
                        setShowExpand(true);
                    }}
                >
                    Expand shipyard
                </Button>
            )}

            {showExpand && (
                <div className='space-y-2 text-xs'>
                    <div className='flex items-center gap-2'>
                        <span className='text-muted-foreground'>New scale:</span>
                        <span className='tabular-nums font-medium'>{targetScale}</span>
                    </div>
                    <Slider
                        min={facility.maxScale + 1}
                        max={facility.maxScale + 10}
                        step={1}
                        value={[targetScale]}
                        onValueChange={([v]) => setTargetScale(v)}
                    />
                    <div className='text-muted-foreground'>
                        Construction cost: {formatNumbers(expandCost)} cs
                        {estimatedCredits ? <span> ≈ {formatNumbers(estimatedCredits)} ₵</span> : null}
                    </div>
                    <div className='flex gap-2'>
                        <Button
                            size='sm'
                            disabled={expandMutation.isPending}
                            onClick={() =>
                                expandMutation.mutate({
                                    agentId,
                                    planetId,
                                    facilityId: facility.id,
                                    targetScale,
                                })
                            }
                        >
                            Expand
                        </Button>
                        <Button size='sm' variant='ghost' onClick={() => setShowExpand(false)}>
                            Cancel
                        </Button>
                    </div>
                    {expandMutation.error && <p className='text-destructive'>{expandMutation.error.message}</p>}
                </div>
            )}
        </FacilityCardShell>
    );
}
