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
import type { TransportShipType } from '@/simulation/ships/ships';
import { defaultBuildingCost } from '@/simulation/ships/ships';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { RiArrowRightBoxFill } from 'react-icons/ri';
import type { ShipConstructionFacility } from '../../../../../../../simulation/planet/facility';
import { FacilityCardShell } from './FacilityCardShell';
import { ProductQuantity } from './ProductQuantity';
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
    const [shipDialogOpen, setShipDialogOpen] = useState(false);

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

    const expandCost = useMemo(
        () => calculateCostsForConstruction('ship_construction', facility.maxScale, targetScale),
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

    const modeBadge = facility.produces ? (
        <Badge variant='outline' className='text-[10px] px-1.5 py-0 text-blue-600 border-blue-300'>
            Building: {facility.shipName}
        </Badge>
    ) : (
        <Badge variant='outline' className='text-[10px] px-1.5 py-0 text-muted-foreground'>
            Idle
        </Badge>
    );

    // Compute per-tick input quantities when building
    let activeShipType: TransportShipType | null = null;

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
                {/* Set target / idle */}
                <div className='flex items-center gap-1 rounded-md border p-0.5 self-start'>
                    <Button
                        size='sm'
                        variant={facility.produces !== null ? 'default' : 'ghost'}
                        className='h-6 px-2.5 text-xs'
                        disabled={setTargetMutation.isPending || facility.produces !== null}
                        onClick={() => setShipDialogOpen(true)}
                    >
                        Building
                    </Button>
                    <Button
                        size='sm'
                        variant={facility.produces === null ? 'default' : 'ghost'}
                        className='h-6 px-2.5 text-xs'
                        disabled={setTargetMutation.isPending || facility.produces === null}
                        onClick={() =>
                            setTargetMutation.mutate({
                                agentId,
                                planetId,
                                facilityId: facility.id,
                                shipTypeName: null,
                                shipName: '',
                            })
                        }
                    >
                        Idle
                    </Button>
                </div>

                {/* Efficiency */}
                <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                    <span>Overall efficiency</span>
                    <span className='tabular-nums font-medium text-foreground'>{Math.round(eff * 100)}%</span>
                </div>

                {/* IO row — always visible */}
                <div className='grid w-full items-center gap-x-2 py-1' style={{ gridTemplateColumns: '1fr auto 1fr' }}>
                    {/* Inputs */}
                    <div className='flex flex-wrap gap-1.5 justify-center'>
                        {facility.produces !== null
                            ? defaultBuildingCost.map((costEntry) => {
                                  if (activeShipType && proportionPerTick !== null) {
                                      const costForThisShip = activeShipType.buildingCost.find(
                                          (c) => c.resource.name === costEntry.resource.name,
                                      );
                                      const qty = costForThisShip
                                          ? costForThisShip.quantity * proportionPerTick * eff
                                          : 0;
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
                                  }
                                  return (
                                      <ProductQuantity
                                          key={costEntry.resource.name}
                                          resource={costEntry.resource}
                                          quantity={0}
                                          efficiency={1}
                                          isLimiting={false}
                                          planetId={currentPlanetId}
                                          agentId={currentAgentId}
                                          quantityLabel='?'
                                      />
                                  );
                              })
                            : null}
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
                                    <FacilityOrShipIcon facilityOrShipName={facility.produces.name} size={180} />
                                    <span className='text-xs font-medium text-center leading-tight max-w-[180px] truncate'>
                                        {facility.shipName}
                                    </span>
                                </Badge>
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

                {/* Build progress if active */}
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
            </FacilityCardShell>
        </>
    );
}
