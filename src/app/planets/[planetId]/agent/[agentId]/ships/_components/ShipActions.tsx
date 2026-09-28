'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAddPendingAction } from '@/hooks/useActionOverlay';
import { useTRPC } from '@/lib/trpc';
import type { Ship } from '@/simulation/ships/ships';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DispatchConstructionShipDialog } from './DispatchConstructionShipDialog';
import { DispatchPassengerShipDialog } from './DispatchPassengerShipDialog';
import { DispatchShipDialog } from './DispatchShipDialog';
import type { ShipListing } from './shipTypes';

export function ShipActions({
    agentId,
    planetId,
    ship,
    listings,
}: {
    agentId: string;
    planetId: string;
    ship: Ship;
    listings: ShipListing[];
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const addPending = useAddPendingAction();
    const t = useTranslations('Ships');
    const tc = useTranslations('Common');
    const isIdle = ship.state.type === 'idle';

    const [sellMode, setSellMode] = useState(false);
    const [sellPrice, setSellPrice] = useState('');

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
                setSellMode(false);
                setSellPrice('');
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.listShipListings.queryKey({ planetId }),
                });
                void queryClient.invalidateQueries({ queryKey: trpc.simulation.listAgentShips.queryKey({ agentId }) });
            },
        }),
    );

    const cancelListingMutation = useMutation(
        trpc.cancelShipListing.mutationOptions({
            onSuccess: (data, variables) => {
                const listing = listings.find((l) => l.id === variables.listingId);
                if (listing) {
                    addPending({
                        type: 'shipCancelListing',
                        agentId,
                        planetId,
                        shipId: listing.shipId,
                        triggerTick: data.processedAtTick,
                    });
                }
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.listShipListings.queryKey({ planetId }),
                });
                void queryClient.invalidateQueries({ queryKey: trpc.simulation.listAgentShips.queryKey({ agentId }) });
            },
        }),
    );

    const listing = listings.find((l) => l.shipId === ship.id && l._agentId === agentId);

    return (
        <div className='mt-auto space-y-2'>
            <Separator />

            {ship.state.type === 'listed' && listing && (
                <Button
                    size='sm'
                    variant='destructive'
                    className='w-full text-xs'
                    disabled={cancelListingMutation.isPending}
                    onClick={() => cancelListingMutation.mutate({ agentId, planetId, listingId: listing.id })}
                >
                    {t('market.cancelListing')}
                </Button>
            )}

            {isIdle && !sellMode && (
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
                                {tc('dispatch')}
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
                                {tc('dispatch')}
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
                                {tc('dispatch')}
                            </Button>
                        </DispatchPassengerShipDialog>
                    )}
                    <Button size='sm' variant='outline' className='flex-1 text-xs' onClick={() => setSellMode(true)}>
                        {t('market.sell')}
                    </Button>
                </div>
            )}

            {isIdle && sellMode && (
                <div className='flex gap-2 flex-wrap'>
                    <Input
                        type='number'
                        min={1}
                        className='flex-1 min-w-[100px] h-8 text-sm'
                        placeholder={t('market.askPrice')}
                        value={sellPrice}
                        onChange={(e) => setSellPrice(e.target.value)}
                    />
                    <Button
                        size='sm'
                        className='text-xs'
                        disabled={!sellPrice || Number(sellPrice) <= 0 || sellMutation.isPending}
                        onClick={() =>
                            sellMutation.mutate({
                                agentId,
                                planetId,
                                shipId: ship.id,
                                askPrice: Number(sellPrice),
                            })
                        }
                    >
                        {tc('confirm')}
                    </Button>
                    <Button size='sm' variant='destructive' className='text-xs' onClick={() => setSellMode(false)}>
                        {tc('cancel')}
                    </Button>
                </div>
            )}
        </div>
    );
}
