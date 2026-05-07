'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import type { ConstructionShip, PassengerShip, TransportShip } from '@/simulation/ships/ships';
import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { PostTransportContractDialog } from '@/app/planets/[planetId]/ships/_components/PostTransportContractDialog';
import { DispatchShipDialog } from './_components/DispatchShipDialog';
import { DispatchConstructionShipDialog } from './_components/DispatchConstructionShipDialog';
import { DispatchPassengerShipDialog } from './_components/DispatchPassengerShipDialog';
import { ShipStatusDetail } from './_components/ShipStatusDetail';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

function statusBadge(ship: TransportShip | ConstructionShip | PassengerShip) {
    const { state } = ship;
    const variants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
        idle: 'secondary',
        transporting: 'default',
        loading: 'outline',
        unloading: 'outline',
    };
    return <Badge variant={variants[state.type] ?? 'secondary'}>{state.type}</Badge>;
}

function conditionColor(status: number) {
    if (status >= 0.75) {
        return 'text-green-600';
    }
    if (status >= 0.4) {
        return 'text-yellow-600';
    }
    return 'text-red-600';
}

export default function AgentShipsPage() {
    const { agentId, planetId, isLoading, isOwnAgent, myAgentId, tick } = useAgentPlanetDetail();
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const [sellMode, setSellMode] = useState<Record<string, boolean>>({});
    const [sellPrice, setSellPrice] = useState<Record<string, string>>({});

    const sellMutation = useMutation(
        trpc.postShipListing.mutationOptions({
            onSuccess: (_data, variables) => {
                setSellMode((prev) => ({ ...prev, [variables.shipId]: false }));
                setSellPrice((prev) => ({ ...prev, [variables.shipId]: '' }));
                void queryClient.invalidateQueries({ queryKey: trpc.listShipListings.queryKey({ planetId }) });
                void queryClient.invalidateQueries({ queryKey: trpc.listAgentShips.queryKey({ agentId }) });
            },
        }),
    );

    const cancelListingMutation = useMutation(
        trpc.cancelShipListing.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({ queryKey: trpc.listShipListings.queryKey({ planetId }) });
                void queryClient.invalidateQueries({ queryKey: trpc.listAgentShips.queryKey({ agentId }) });
            },
        }),
    );

    const { data: listingsData } = useSimulationQuery(
        trpc.listShipListings.queryOptions({ planetId }, { enabled: isOwnAgent }),
    );

    const { data: shipsData, isLoading: shipsLoading } = useSimulationQuery(
        trpc.listAgentShips.queryOptions({ agentId }, { enabled: isOwnAgent }),
    );

    const { data: planetSummariesData } = useSimulationQuery(trpc.simulation.getLatestPlanetSummaries.queryOptions());
    const planetSummaries = planetSummariesData?.planets ?? [];

    const shipsHere = (shipsData?.ships ?? [])
        .filter(
            (s) =>
                ('planetId' in s.state && s.state.planetId === planetId) ||
                ('to' in s.state && s.state.to === planetId) ||
                ('from' in s.state && s.state.from === planetId),
        )
        .map((s) => {
            if ('to' in s.state || 'from' in s.state) {
                return {
                    ...s,
                    disabled: true,
                };
            }
            return { ...s, disabled: false };
        });

    return (
        <AgentAccessGuard isLoading={myAgentId.isLoading} isOwnAgent={isOwnAgent}>
            <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                        {shipsLoading
                            ? 'Loading…'
                            : `${shipsHere.length} ship${shipsHere.length === 1 ? '' : 's'} on this planet`}
                    </h3>
                    <PostTransportContractDialog agentId={agentId} planetId={planetId} tick={tick}>
                        <Button size='sm' variant='outline'>
                            Post Transport Contract
                        </Button>
                    </PostTransportContractDialog>
                </div>

                {!isLoading && !shipsLoading && shipsHere.length === 0 && (
                    <p className='text-sm text-muted-foreground'>No ships currently stationed on this planet.</p>
                )}

                <div className='space-y-3'>
                    {shipsHere.map((ship) => {
                        const isIdle = ship.state.type === 'idle';
                        return (
                            <Card key={ship.id}>
                                <CardContent
                                    className={`px-4 py-4 ${ship.disabled ? 'opacity-50 pointer-events-none' : ''}`}
                                >
                                    <div className='flex items-start justify-between gap-4'>
                                        <div className='flex items-start flex-wrap gap-3'>
                                            <FacilityOrShipIcon facilityOrShipName={ship.type.name} suffix='' />
                                            <div className='space-y-1'>
                                                <div className='flex items-center gap-2'>
                                                    <span className='font-medium'>{ship.name}</span>
                                                    {statusBadge(ship)}
                                                </div>
                                                {ship.type.type === 'transport' ? (
                                                    <p className='text-xs text-muted-foreground'>
                                                        {ship.type.name} · {ship.type.cargoSpecification.type} ·{' '}
                                                        {ship.type.cargoSpecification.volume} m³ · speed{' '}
                                                        {ship.type.speed}
                                                    </p>
                                                ) : (
                                                    <p className='text-xs text-muted-foreground'>
                                                        {ship.type.name} · speed {ship.type.speed}
                                                    </p>
                                                )}
                                                <p
                                                    className={`text-xs font-medium ${conditionColor(ship.maintainanceStatus)}`}
                                                >
                                                    Condition: {Math.round(ship.maintainanceStatus * 100)}% Max:{' '}
                                                    {Math.round(ship.maxMaintenance * 100)}%
                                                </p>
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
                                            </div>
                                        </div>
                                        <div className='flex gap-2 flex-shrink-0 items-center'>
                                            {ship.state.type === 'listed' &&
                                                (() => {
                                                    const listing = (listingsData?.listings ?? []).find(
                                                        (l) => l.shipId === ship.id && l._agentId === agentId,
                                                    );
                                                    return listing ? (
                                                        <Button
                                                            size='sm'
                                                            variant='outline'
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
                                                <>
                                                    {ship.type.type === 'transport' && (
                                                        <DispatchShipDialog
                                                            agentId={agentId}
                                                            planetId={planetId}
                                                            shipId={ship.id}
                                                            shipName={ship.name}
                                                            shipCargoType={ship.type.cargoSpecification.type}
                                                        >
                                                            <Button size='sm' variant='outline'>
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
                                                            <Button size='sm' variant='outline'>
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
                                                            <Button size='sm' variant='outline'>
                                                                Dispatch
                                                            </Button>
                                                        </DispatchPassengerShipDialog>
                                                    )}
                                                    <Button
                                                        size='sm'
                                                        variant='outline'
                                                        onClick={() =>
                                                            setSellMode((prev) => ({ ...prev, [ship.id]: true }))
                                                        }
                                                    >
                                                        Sell
                                                    </Button>
                                                </>
                                            )}
                                            {isIdle && sellMode[ship.id] && (
                                                <>
                                                    <Input
                                                        type='number'
                                                        min={1}
                                                        className='w-28 h-8 text-sm'
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
                                                        variant='ghost'
                                                        onClick={() =>
                                                            setSellMode((prev) => ({
                                                                ...prev,
                                                                [ship.id]: false,
                                                            }))
                                                        }
                                                    >
                                                        Cancel
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>
        </AgentAccessGuard>
    );
}
