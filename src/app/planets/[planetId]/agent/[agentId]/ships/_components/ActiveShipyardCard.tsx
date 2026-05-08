'use client';

import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { ProductQuantity } from '@/components/client/ProductQuantity';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAgentId } from '@/hooks/useAgentId';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { usePlanetId } from '@/hooks/usePlanetId';
import { useTRPC } from '@/lib/trpc';
import type { ShipConstructionFacility } from '@/simulation/planet/facility';
import type { BaseShipType } from '@/simulation/ships/ships';
import { defaultBuildingCost } from '@/simulation/ships/ships';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { RiArrowRightBoxFill } from 'react-icons/ri';
import { FacilityCardShell } from '../../production/_component/FacilityCardShell';
import { WorkerBars } from '../../production/_component/WorkerBars';
import { ShipSelectionDialog } from './ShipSelectionDialog';

export function ActiveShipyardCard({
    facility,
    agentId,
    planetId,
}: {
    facility: ShipConstructionFacility;
    agentId: string;
    planetId: string;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const currentPlanetId = usePlanetId();
    const { agentId: currentAgentId } = useAgentId();

    const [shipDialogOpen, setShipDialogOpen] = useState(false);

    const isSmallScreen = useIsSmallScreen();

    const invalidate = () =>
        void queryClient.invalidateQueries({
            queryKey: trpc.simulation.getAgentPlanetDetail.queryKey({ agentId, planetId }),
        });

    const setTargetMutation = useMutation(
        trpc.setShipConstructionTarget.mutationOptions({
            onSuccess: () => {
                invalidate();
                setShipDialogOpen(false);
            },
        }),
    );

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
                                        size={isSmallScreen ? 120 : 180}
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
            </FacilityCardShell>
        </>
    );
}
