'use client';

import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { ProductQuantity } from '@/components/client/ProductQuantity';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAddPendingAction, usePendingActions } from '@/hooks/useActionOverlay';
import { useAgentId } from '@/hooks/useAgentId';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { usePlanetId } from '@/hooks/usePlanetId';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useErrorMessage } from '@/i18n/errors';
import { useTRPC } from '@/lib/trpc';
import { isFacilityOperating } from '@/simulation/planet/facility';
import type { ShipConstructionFacility } from '@/simulation/planet/facility';
import type { BaseShipType } from '@/simulation/ships/ships';
import { defaultBuildingCost } from '@/simulation/ships/ships';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { RiArrowRightBoxFill } from 'react-icons/ri';
import { FacilityCardShell } from '../../production/_component/FacilityCardShell';
import { FacilityConditionRow } from '../../production/_component/FacilityConditionRow';
import { FacilityConstructionPanel } from '../../production/_component/FacilityConstructionPanel';
import { FacilityHeader } from '../../_component/FacilityHeader';
import { PendingActionIndicator } from '../../_component/PendingActionIndicator';
import { useTranslations } from 'next-intl';
import { ShipBuildProgressRow } from './ShipBuildProgressRow';
import { ShipSelectionDialog } from './ShipSelectionDialog';

export function ActiveShipyardCard({
    facility,
    agentId,
    planetId,
    constructionServicePrice,
}: {
    facility: ShipConstructionFacility;
    agentId: string;
    planetId: string;
    constructionServicePrice: number;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const t = useTranslations('Ships');
    const tt = useTranslations('Toasts');
    const showError = useErrorMessage();
    const currentPlanetId = usePlanetId();
    const { agentId: currentAgentId } = useAgentId();

    const addPending = useAddPendingAction();
    const pendingActions = usePendingActions(agentId, planetId);
    const pendingTarget = pendingActions.find((a) => a.type === 'shipSetTarget' && a.facilityId === facility.id);
    const pendingExpand = pendingActions.find((a) => a.type === 'shipExpand' && a.facilityId === facility.id);
    const pending = pendingTarget ?? pendingExpand;

    const [shipDialogOpen, setShipDialogOpen] = useState(false);
    const [showExpand, setShowExpand] = useState(false);

    const isSmallScreen = useIsSmallScreen();
    const isMobile = isSmallScreen;

    const { data: financials } = useSimulationQuery(
        trpc.simulation.getAgentFinancials.queryOptions({ agentId, planetId }),
    );

    const invalidate = () =>
        void queryClient.invalidateQueries({
            queryKey: trpc.simulation.getAgentPlanetDetail.queryKey({ agentId, planetId }),
        });

    const setTargetMutation = useMutation(
        trpc.setShipConstructionTarget.mutationOptions({
            onSuccess: (data) => {
                addPending({
                    type: 'shipSetTarget',
                    agentId,
                    planetId,
                    facilityId: facility.id,
                    triggerTick: data.processedAtTick,
                });
                invalidate();
                setShipDialogOpen(false);
            },
        }),
    );

    const expandMutation = useMutation(
        trpc.expandShipConstructionFacility.mutationOptions({
            onSuccess: (data) => {
                addPending({
                    type: 'shipExpand',
                    agentId,
                    planetId,
                    facilityId: facility.id,
                    triggerTick: data.processedAtTick,
                });
                invalidate();
                setShowExpand(false);
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
                agentId={agentId}
                planetId={planetId}
                isPending={setTargetMutation.isPending}
                error={setTargetMutation.error ? showError(setTargetMutation.error) : null}
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
                    <FacilityHeader
                        facility={facility}
                        results={results}
                        planetId={planetId}
                        agentId={agentId}
                        badge={
                            <div className='flex gap-1 flex-wrap'>
                                <Badge variant='outline' className='text-[10px] px-1.5 py-0'>
                                    {t('build.scaleLine', { scale: facility.scale })}
                                    {facility.scale === facility.maxScale ? ` ${t('build.max')}` : ''}
                                </Badge>
                            </div>
                        }
                    />
                }
            >
                <div className='grid w-full items-center gap-x-2 py-1' style={{ gridTemplateColumns: '1fr auto 1fr' }}>
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

                    <div className='flex flex-wrap gap-1.5 justify-center'>
                        {facility.produces !== null ? (
                            <div className='relative inline-flex flex-col items-center gap-1.5 rounded bg-muted px-2 py-1 overflow-hidden'>
                                <FacilityOrShipIcon
                                    facilityOrShipName={facility.produces.name}
                                    size={isMobile ? 60 : 80}
                                    buildProgress={facility.progress}
                                />
                                <span className='text-xs font-medium text-center leading-tight max-w-[180px] truncate'>
                                    {facility.shipName}
                                </span>
                            </div>
                        ) : (
                            <Button
                                size='sm'
                                variant='outline'
                                className='text-xs'
                                disabled={!!pending}
                                onClick={() => setShipDialogOpen(true)}
                            >
                                {t('build.selectShipToBuild')}
                            </Button>
                        )}
                    </div>
                </div>
                {facility.produces && (
                    <>
                        <ShipBuildProgressRow shipName={facility.shipName} progress={facility.progress} />
                        <Separator />
                    </>
                )}
                {isFacilityOperating(facility) && (
                    <FacilityConditionRow facility={facility} agentId={agentId} planetId={planetId} />
                )}
                {showExpand ? (
                    <FacilityConstructionPanel
                        facilityType='ship_construction'
                        fromScale={facility.maxScale}
                        constructionServicePrice={constructionServicePrice}
                        planetId={planetId}
                        label={t('build.expandShipyard')}
                        confirmLabel={t('build.confirmExpand')}
                        pendingLabel={t('build.orderingExpansion')}
                        isPending={expandMutation.isPending}
                        financials={financials}
                        onCancel={() => setShowExpand(false)}
                        onConfirm={(targetScale) =>
                            expandMutation.mutate({ agentId, planetId, facilityId: facility.id, targetScale })
                        }
                    />
                ) : (
                    <div className='flex gap-2 pt-1'>
                        <Button
                            size='sm'
                            className='flex-1 text-xs gap-1'
                            disabled={facility.construction !== null || !!pending}
                            onClick={() => setShowExpand(true)}
                        >
                            {t('build.expandShipyard')}
                        </Button>
                    </div>
                )}
                {pending && <PendingActionIndicator message={tt('awaitingNextDay')} />}
            </FacilityCardShell>
        </>
    );
}
