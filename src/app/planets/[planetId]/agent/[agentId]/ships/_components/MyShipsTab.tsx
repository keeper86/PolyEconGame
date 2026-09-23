'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { useAddPendingAction, usePendingActions } from '@/hooks/useActionOverlay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FacilityCardShell } from '../../production/_component/FacilityCardShell';
import { DispatchShipDialog } from './DispatchShipDialog';
import { DispatchConstructionShipDialog } from './DispatchConstructionShipDialog';
import { DispatchPassengerShipDialog } from './DispatchPassengerShipDialog';
import { ShipConditionRow } from './ShipConditionRow';
import { ShipHeader } from './ShipHeader';
import { ShipStatusBadge } from './ShipStatusBadge';
import { ShipStatusDetail } from './ShipStatusDetail';

export function MyShipsTab({
    agentId,
    planetId,
    tick,
}: {
    agentId: string;
    planetId: string;
    tick: number;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const addPending = useAddPendingAction();
    const pendingActions = usePendingActions(agentId, planetId);

    const [sellMode, setSellMode] = useState<Record<string, boolean>>({});
    const [sellPrice, setSellPrice] = useState<Record<string, string>>({});

    const { data: listingsData } = useSimulationQuery(trpc.listShipListings.queryOptions({ planetId }));

    const { data: shipsData, isLoading: shipsLoading } = useSimulationQuery(
        trpc.listAgentShips.queryOptions({ agentId }),
    );

    const { data: planetSummariesData } = useSimulationQuery(trpc.simulation.getLatestPlanetSummaries.queryOptions());
    const planetSummaries = planetSummariesData?.planets ?? [];

    const sellMutation = useMutation(
        trpc.postShipListing.mutationOptions({
            onSuccess: (data, variables) => {
                addPending({
                    type: 'shipList',
                    agentId,
                    planetId,
                    shipId: variables.shipId,
                    triggerTick: data.processedAtTick,
                });
                setSellMode((prev) => ({ ...prev, [variables.shipId]: false }));
                setSellPrice((prev) => ({ ...prev, [variables.shipId]: '' }));
                void queryClient.invalidateQueries({ queryKey: trpc.listShipListings.queryKey({ planetId }) });
                void queryClient.invalidateQueries({ queryKey: trpc.listAgentShips.queryKey({ agentId }) });
            },
        }),
    );

    const cancelListingMutation = useMutation(
        trpc.cancelShipListing.mutationOptions({
            onSuccess: (data, variables) => {
                const listing = (listingsData?.listings ?? []).find((l) => l.id === variables.listingId);
                if (listing) {
                    addPending({
                        type: 'shipCancelListing',
                        agentId,
                        planetId,
                        shipId: listing.shipId,
                        triggerTick: data.processedAtTick,
                    });
                }
                void queryClient.invalidateQueries({ queryKey: trpc.listShipListings.queryKey({ planetId }) });
                void queryClient.invalidateQueries({ queryKey: trpc.listAgentShips.queryKey({ agentId }) });
            },
        }),
    );

    const shipsHere = (shipsData?.ships ?? [])
        .filter(
            (s) =>
                ('planetId' in s.state && s.state.planetId === planetId) ||
                ('to' in s.state && s.state.to === planetId) ||
                ('from' in s.state && s.state.from === planetId),
        )
        .map((s) => {
            if ('to' in s.state || 'from' in s.state) {
                return { ...s, disabled: true };
            }
            return { ...s, disabled: false };
        });

    return (
        <div className='space-y-4 mt-3'>
            <h3 className='text-sm font-medium text-muted-foreground'>
                {shipsLoading
                    ? 'Loading…'
                    : `${shipsHere.length} ship${shipsHere.length === 1 ? '' : 's'} on this planet`}
            </h3>

            {!shipsLoading && shipsHere.length === 0 && (
                <p className='text-sm text-muted-foreground'>No ships currently stationed on this planet.</p>
            )}

            <div className='flex flex-row gap-3 flex-wrap'>
                {shipsHere.map((ship) => {
                    const isIdle = ship.state.type === 'idle';
                    const pending = pendingActions.find((a) => a.shipId === ship.id);
                    return (
                        <FacilityCardShell
                            key={ship.id}
                            className={ship.disabled || pending ? 'opacity-50 pointer-events-none' : ''}
                            contentClassName='flex flex-col flex-1 gap-2'
                            icon={<FacilityOrShipIcon facilityOrShipName={ship.type.name} suffix='' size={240} />}
                            headerContent={
                                <ShipHeader
                                    ship={ship}
                                    badge={<ShipStatusBadge ship={ship} />}
                                    details={
                                        <>
                                            <span>
                                                {ship.type.name} · speed {ship.type.speed}
                                            </span>
                                            {ship.type.type === 'transport' && (
                                                <span className='flex flex-wrap'>
                                                    {ship.type.cargoSpecification.volume} m³ ·{' '}
                                                    {ship.type.cargoSpecification.type}
                                                </span>
                                            )}
                                            <ShipConditionRow ship={ship} />
                                        </>
                                    }
                                />
                            }
                        >
                            {ship.state.type !== 'idle' &&
                                ship.state.type !== 'listed' &&
                                ship.state.type !== 'derelict' && (
                                    <ShipStatusDetail
                                        ship={ship}
                                        planetSummaries={planetSummaries}
                                        tick={tick}
                                        agentId={agentId}
                                    />
                                )}

                            <div className='mt-auto space-y-2'>
                                <Separator />

                                {ship.state.type === 'listed' &&
                                    (() => {
                                        const listing = (listingsData?.listings ?? []).find(
                                            (l) => l.shipId === ship.id && l._agentId === agentId,
                                        );
                                        return listing ? (
                                            <Button
                                                size='sm'
                                                variant='destructive'
                                                className='w-full text-xs'
                                                disabled={cancelListingMutation.isPending}
                                                onClick={() =>
                                                    cancelListingMutation.mutate({
                                                        agentId,
                                                        planetId,
                                                        listingId: listing.id,
                                                    })
                                                }
                                            >
                                                Cancel Listing
                                            </Button>
                                        ) : null;
                                    })()}

                                {isIdle && !sellMode[ship.id] && (
                                    <div className='flex gap-2 flex-wrap'>
                                        {ship.type.type === 'transport' && (
                                            <DispatchShipDialog
                                                agentId={agentId}
                                                planetId={planetId}
                                                shipId={ship.id}
                                                shipName={ship.name}
                                                shipCargoType={ship.type.cargoSpecification.type}
                                            >
                                                <Button size='sm' variant='outline' className='flex-1 text-xs'>
                                                    Dispatch
                                                </Button>
                                            </DispatchShipDialog>
                                        )}
                                        {ship.type.type === 'construction' && (
                                            <DispatchConstructionShipDialog
                                                agentId={agentId}
                                                planetId={planetId}
                                                shipId={ship.id}
                                                shipName={ship.name}
                                            >
                                                <Button size='sm' variant='outline' className='flex-1 text-xs'>
                                                    Dispatch
                                                </Button>
                                            </DispatchConstructionShipDialog>
                                        )}
                                        {ship.type.type === 'passenger' && (
                                            <DispatchPassengerShipDialog
                                                agentId={agentId}
                                                planetId={planetId}
                                                shipId={ship.id}
                                                shipName={ship.name}
                                                passengerCapacity={ship.type.passengerCapacity}
                                            >
                                                <Button size='sm' variant='outline' className='flex-1 text-xs'>
                                                    Dispatch
                                                </Button>
                                            </DispatchPassengerShipDialog>
                                        )}
                                        <Button
                                            size='sm'
                                            variant='outline'
                                            className='flex-1 text-xs'
                                            onClick={() => setSellMode((prev) => ({ ...prev, [ship.id]: true }))}
                                        >
                                            Sell
                                        </Button>
                                    </div>
                                )}

                                {isIdle && sellMode[ship.id] && (
                                    <div className='flex gap-2 flex-wrap'>
                                        <Input
                                            type='number'
                                            min={1}
                                            className='flex-1 min-w-[100px] h-8 text-sm'
                                            placeholder='Ask price'
                                            value={sellPrice[ship.id] ?? ''}
                                            onChange={(e) =>
                                                setSellPrice((prev) => ({
                                                    ...prev,
                                                    [ship.id]: e.target.value,
                                                }))
                                            }
                                        />
                                        <Button
                                            size='sm'
                                            className='text-xs'
                                            disabled={!sellPrice[ship.id] || sellMutation.isPending}
                                            onClick={() =>
                                                sellMutation.mutate({
                                                    agentId,
                                                    planetId,
                                                    shipId: ship.id,
                                                    askPrice: Number(sellPrice[ship.id]),
                                                })
                                            }
                                        >
                                            Confirm
                                        </Button>
                                        <Button
                                            size='sm'
                                            variant='destructive'
                                            className='text-xs'
                                            onClick={() =>
                                                setSellMode((prev) => ({
                                                    ...prev,
                                                    [ship.id]: false,
                                                }))
                                            }
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                )}
                                {pending && (
                                    <div className='flex items-center justify-center gap-2 rounded-lg bg-muted/70 py-2 text-sm font-medium text-foreground'>
                                        <Spinner className='h-4 w-4' />
                                        Awaiting next day…
                                    </div>
                                )}
                            </div>
                        </FacilityCardShell>
                    );
                })}
            </div>
        </div>
    );
}
