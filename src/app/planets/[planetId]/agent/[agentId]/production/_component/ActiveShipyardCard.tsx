'use client';

import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { useAgentId } from '@/hooks/useAgentId';
import { usePlanetId } from '@/hooks/usePlanetId';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import { calculateCostsForConstruction } from '@/simulation/planet/facility';
import type { BaseShipType } from '@/simulation/ships/ships';
import { defaultBuildingCost } from '@/simulation/ships/ships';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { RiArrowRightBoxFill } from 'react-icons/ri';
import type { ShipConstructionFacility } from '@/simulation/planet/facility';
import { FacilityCardShell } from './FacilityCardShell';
import { ProductQuantity } from '@/components/client/ProductQuantity';
import { ShipSelectionDialog } from './ShipSelectionDialog';
import { WorkerBars } from './WorkerBars';

export function ActiveShipyardCard({
    facility,
    agentId,
    planetId,
    constructionServicePrice,
    onExpanded,
}: {
    facility: ShipConstructionFacility;
    agentId: string;
    planetId: string;
    constructionServicePrice?: number;
    onExpanded: () => void;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const currentPlanetId = usePlanetId();
    const { agentId: currentAgentId } = useAgentId();

    const [targetScale, setTargetScale] = useState(facility.maxScale + 1);
    const [showExpand, setShowExpand] = useState(false);
    const [showSetScale, setShowSetScale] = useState(false);
    const [shipDialogOpen, setShipDialogOpen] = useState(false);

    const SCALE_FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;
    const computeScaleFractionIndex = (scale: number, maxScale: number) => {
        const fraction = maxScale > 0 ? Math.round((scale / maxScale) * 4) / 4 : 1;
        const idx = SCALE_FRACTIONS.indexOf(fraction as (typeof SCALE_FRACTIONS)[number]);
        return idx >= 0 ? idx : 4;
    };
    const [scaleFractionIndex, setScaleFractionIndex] = useState(() =>
        computeScaleFractionIndex(facility.scale, facility.maxScale),
    );
    useEffect(() => {
        setScaleFractionIndex(computeScaleFractionIndex(facility.scale, facility.maxScale));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [facility.scale, facility.maxScale]);

    const invalidate = () =>
        void queryClient.invalidateQueries({
            queryKey: trpc.simulation.getAgentPlanetDetail.queryKey({ agentId, planetId }),
        });

    const expandMutation = useMutation(
        trpc.expandShipConstructionFacility.mutationOptions({
            onSuccess: () => {
                invalidate();
                setShowExpand(false);
                onExpanded();
            },
        }),
    );

    const setTargetMutation = useMutation(
        trpc.setShipConstructionTarget.mutationOptions({
            onSuccess: () => {
                invalidate();
                setShipDialogOpen(false);
            },
        }),
    );

    const setScaleMutation = useMutation(
        trpc.setFacilityScale.mutationOptions({
            onSuccess: () => {
                invalidate();
                setShowSetScale(false);
            },
        }),
    );

    const expandCost = useMemo(
        () => calculateCostsForConstruction('ship_construction', facility.maxScale, targetScale),
        [facility.maxScale, targetScale],
    );
    const estimatedCredits =
        constructionServicePrice && constructionServicePrice > 0 ? expandCost * constructionServicePrice : null;

    const results = facility.lastTickResults;
    const globalMin = results
        ? Math.min(
              ...Object.values(results.resourceEfficiency),
              ...Object.values(results.workerEfficiency).filter((v): v is number => v !== undefined),
          )
        : 1;

    // Compute per-tick input quantities when building
    let activeShipType: BaseShipType | null = null;

    let proportionPerTick: number | null = null;

    if (facility.produces) {
        activeShipType = facility.produces;
        proportionPerTick = Math.min(1, Math.sqrt(facility.scale) / activeShipType.buildingTime);
    }

    return (
        <>
            <ShipSelectionDialog
                open={shipDialogOpen}
                onOpenChange={setShipDialogOpen}
                isPending={setTargetMutation.isPending}
                error={setTargetMutation.error?.message}
                onConfirm={(shipTypeName, shipName) =>
                    setTargetMutation.mutate({
                        agentId,
                        planetId,
                        facilityId: facility.id,
                        shipTypeName,
                        shipName,
                    })
                }
            />

            <FacilityCardShell
                contentClassName='flex flex-col flex-1 gap-2'
                icon={<FacilityOrShipIcon facilityOrShipName='Shipyard' suffix={String(facility.scale)} />}
                headerContent={
                    <span className='flex flex-col gap-2'>
                        <div className='flex items-center gap-1 flex-col mb-auto'>
                            <h3 className='font-semibold leading-tight'>{facility.name}</h3>
                            <div className='flex gap-1 flex-wrap'>
                                <Badge variant='outline' className='text-[10px] px-1.5 py-0'>
                                    Scale {facility.scale} {facility.scale === facility.maxScale ? 'max' : ''}
                                </Badge>
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
                <div className='grid w-full items-center gap-x-2 py-1' style={{ gridTemplateColumns: '1fr auto 1fr' }}>
                    {/* Inputs */}
                    <div className='flex flex-wrap gap-1.5 justify-center'>
                        {facility.produces !== null && activeShipType !== null && proportionPerTick !== null
                            ? activeShipType.buildingCost.map((costEntry) => {
                                  const qty = costEntry.quantity * proportionPerTick;
                                  const resEff = results?.resourceEfficiency[costEntry.resource.name] ?? 1;
                                  return (
                                      <ProductQuantity
                                          key={costEntry.resource.name}
                                          resource={costEntry.resource}
                                          quantity={qty}
                                          efficiency={resEff}
                                          isLimiting={resEff <= globalMin && globalMin < 0.99}
                                          planetId={currentPlanetId}
                                          agentId={currentAgentId}
                                      />
                                  );
                              })
                            : defaultBuildingCost.map((costEntry) => (
                                  <ProductQuantity
                                      key={costEntry.resource.name}
                                      resource={costEntry.resource}
                                      quantity={costEntry.quantity}
                                      efficiency={1}
                                      isLimiting={false}
                                      planetId={currentPlanetId}
                                      agentId={currentAgentId}
                                      quantityLabel='?'
                                  />
                              ))}
                    </div>

                    <RiArrowRightBoxFill className='shrink-0 h-8 w-8 text-muted-foreground' />

                    {/* Output */}
                    <div className='flex flex-wrap gap-1.5 justify-center'>
                        {facility.produces !== null ? (
                            <div className='relative inline-flex flex-col items-center gap-1.5 rounded bg-muted px-2 py-1 overflow-hidden'>
                                <Badge
                                    variant='outline'
                                    className='text-[10px] px-1.5 py-0 text-blue-600 border-blue-300'
                                >
                                    <FacilityOrShipIcon
                                        facilityOrShipName={facility.produces.name}
                                        size={180}
                                        buildProgress={facility.progress}
                                    />
                                </Badge>
                                <span className='text-xs font-medium text-center leading-tight max-w-[180px] truncate'>
                                    {facility.shipName}
                                </span>
                            </div>
                        ) : (
                            <Button
                                size='sm'
                                variant='outline'
                                className='text-xs'
                                onClick={() => setShipDialogOpen(true)}
                            >
                                Select ship to build
                            </Button>
                        )}
                    </div>
                </div>
                {facility.produces && (
                    <div>
                        <div className='flex justify-between text-xs text-muted-foreground mb-1'>
                            <span>Build progress</span>
                            <span className='tabular-nums font-medium text-foreground'>
                                {Math.round(facility.progress * 100)}%
                            </span>
                        </div>
                        <Progress value={facility.progress * 100} className='h-2' />
                    </div>
                )}
                <Separator />
                {/* Expand section */}
                {!showExpand && (
                    <div className='flex gap-2'>
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
                        <Button
                            size='sm'
                            variant='ghost'
                            className='self-start text-xs'
                            onClick={() => setShowSetScale(true)}
                        >
                            Set scale
                        </Button>
                    </div>
                )}
                {showExpand && (
                    <div className='space-y-2 text-xs'>
                        <div className='flex items-center gap-2'>
                            <span className='text-muted-foreground'>New scale:</span>
                            <span className='tabular-nums font-medium'>{targetScale}</span>
                        </div>
                        <Slider
                            min={facility.maxScale + 1}
                            max={4}
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
                {showSetScale && (
                    <>
                        <Separator />
                        <p className='text-xs font-medium'>Operating scale</p>
                        <Slider
                            min={0}
                            max={SCALE_FRACTIONS.length - 1}
                            step={1}
                            value={[scaleFractionIndex]}
                            onValueChange={([v]) => setScaleFractionIndex(v ?? 0)}
                            disabled={setScaleMutation.isPending}
                        />
                        <div className='relative h-4 text-[10px] text-muted-foreground'>
                            {SCALE_FRACTIONS.map((f, i) => {
                                const pct = (i / (SCALE_FRACTIONS.length - 1)) * 100;
                                const translate = i === 0 ? '0%' : i === SCALE_FRACTIONS.length - 1 ? '-100%' : '-50%';
                                return (
                                    <span
                                        key={f}
                                        className='absolute'
                                        style={{ left: `${pct}%`, transform: `translateX(${translate})` }}
                                    >
                                        {f * 100}%
                                    </span>
                                );
                            })}
                        </div>
                        <div className='flex justify-between text-xs'>
                            <span className='text-muted-foreground'>Resulting scale</span>
                            <span className='font-medium tabular-nums'>
                                {formatNumbers(facility.maxScale * (SCALE_FRACTIONS[scaleFractionIndex] ?? 1))}
                            </span>
                        </div>
                        <div className='flex gap-2'>
                            <Button
                                size='sm'
                                variant='outline'
                                className='flex-1 text-xs'
                                onClick={() => setShowSetScale(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                size='sm'
                                className='flex-1 text-xs'
                                disabled={setScaleMutation.isPending}
                                onClick={() =>
                                    setScaleMutation.mutate({
                                        agentId,
                                        planetId,
                                        facilityId: facility.id,
                                        scaleFraction: SCALE_FRACTIONS[scaleFractionIndex] ?? 1,
                                    })
                                }
                            >
                                {setScaleMutation.isPending ? 'Applying…' : 'Confirm'}
                            </Button>
                        </div>
                    </>
                )}
            </FacilityCardShell>
        </>
    );
}
