'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TransportShip } from '@/simulation/ships/ships';
import { shiptypes } from '@/simulation/ships/ships';
import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { AcceptShipBuyingOfferDialog } from '@/app/planets/[planetId]/agent/[agentId]/ships/_components/AcceptShipBuyingOfferDialog';
import { AcceptTransportContractDialog } from '@/app/planets/[planetId]/agent/[agentId]/ships/_components/AcceptTransportContractDialog';
import { PostShipBuyingOfferDialog } from '@/app/planets/[planetId]/agent/[agentId]/ships/_components/PostShipBuyingOfferDialog';
import { PostTransportContractDialog } from '@/app/planets/[planetId]/agent/[agentId]/ships/_components/PostTransportContractDialog';

const allShipTypesByKey = Object.fromEntries(Object.values(shiptypes).flatMap((cat) => Object.entries(cat))) as Record<
    string,
    { name: string }
>;

export function ShipMarketTab({
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

    const { data: contractsData, isLoading: contractsLoading } = useSimulationQuery(
        trpc.listTransportContracts.queryOptions({ planetId }),
    );
    const { data: buyingData, isLoading: buyingLoading } = useSimulationQuery(
        trpc.listShipBuyingOffers.queryOptions({ planetId }),
    );
    const { data: listingsData, isLoading: listingsLoading } = useSimulationQuery(
        trpc.listShipListings.queryOptions({ planetId }),
    );
    const { data: myShipsData } = useSimulationQuery(trpc.listAgentShips.queryOptions({ agentId }));

    const idleTransportShipsHere = (myShipsData?.ships ?? []).filter(
        (s): s is TransportShip =>
            s.state.type === 'idle' && s.state.planetId === planetId && s.type.type === 'transport',
    );

    const [acceptContractTarget, setAcceptContractTarget] = useState<
        NonNullable<typeof contractsData>['contracts'][number] | null
    >(null);
    const [acceptBuyingTarget, setAcceptBuyingTarget] = useState<
        NonNullable<typeof buyingData>['offers'][number] | null
    >(null);

    const cancelContractMutation = useMutation(
        trpc.cancelTransportContract.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.listTransportContracts.queryKey({ planetId }),
                });
            },
        }),
    );

    const acceptListingMutation = useMutation(
        trpc.acceptShipListing.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({ queryKey: trpc.listShipListings.queryKey({ planetId }) });
                void queryClient.invalidateQueries({ queryKey: trpc.listAgentShips.queryKey({ agentId }) });
            },
        }),
    );

    const openContracts = (contractsData?.contracts ?? []).filter((c) => c.status === 'open');
    const openBuyingOffers = (buyingData?.offers ?? []).filter((o) => o.status === 'open');
    const openListings = listingsData?.listings ?? [];

    return (
        <div className='space-y-6 mt-3'>
            {/* Transport Contracts */}
            <section className='space-y-3'>
                <div className='flex items-center justify-between'>
                    <h3 className='text-sm font-semibold'>
                        Transport Contracts
                        {openContracts.length > 0 && (
                            <Badge variant='secondary' className='ml-2 text-xs'>
                                {openContracts.length}
                            </Badge>
                        )}
                    </h3>
                    <PostTransportContractDialog agentId={agentId} planetId={planetId} tick={tick}>
                        <Button size='sm' variant='outline'>
                            Post Contract
                        </Button>
                    </PostTransportContractDialog>
                </div>
                {contractsLoading && <p className='text-sm text-muted-foreground'>Loading contracts…</p>}
                {!contractsLoading && openContracts.length === 0 && (
                    <p className='text-sm text-muted-foreground'>No open transport contracts on this planet.</p>
                )}
                {openContracts.map((contract) => {
                    const isMyContract = contract._agentId === agentId;
                    const cargoName = contract.cargo.resource.name;
                    const hasEligibleShip = idleTransportShipsHere.length > 0;
                    return (
                        <Card key={contract.id}>
                            <CardHeader className='pb-2 pt-4 px-4'>
                                <CardTitle className='text-sm flex items-center justify-between'>
                                    <span>
                                        {contract.fromPlanetId} → {contract.toPlanetId}
                                    </span>
                                    <Badge variant='outline'>{contract.status}</Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className='px-4 pb-4 flex items-end justify-between gap-4'>
                                <div className='text-sm space-y-0.5'>
                                    <p>
                                        <span className='text-muted-foreground'>Cargo:</span> {contract.cargo.quantity}{' '}
                                        × {cargoName}
                                    </p>
                                    <p>
                                        <span className='text-muted-foreground'>Reward:</span> {contract.offeredReward}
                                    </p>
                                    <p>
                                        <span className='text-muted-foreground'>Max duration:</span>{' '}
                                        {contract.maxDurationInTicks} ticks
                                    </p>
                                </div>
                                <div className='flex gap-2'>
                                    {isMyContract && (
                                        <Button
                                            variant='outline'
                                            size='sm'
                                            disabled={cancelContractMutation.isPending}
                                            onClick={() =>
                                                cancelContractMutation.mutate({
                                                    agentId,
                                                    planetId,
                                                    contractId: contract.id,
                                                })
                                            }
                                        >
                                            Cancel
                                        </Button>
                                    )}
                                    {!isMyContract && (
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span>
                                                        <Button
                                                            size='sm'
                                                            disabled={!hasEligibleShip}
                                                            onClick={() => setAcceptContractTarget(contract)}
                                                        >
                                                            Accept
                                                        </Button>
                                                    </span>
                                                </TooltipTrigger>
                                                {!hasEligibleShip && (
                                                    <TooltipContent>
                                                        No idle ship available on this planet
                                                    </TooltipContent>
                                                )}
                                            </Tooltip>
                                        </TooltipProvider>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </section>

            {/* Ship Market */}
            <section className='space-y-3'>
                <div className='flex items-center justify-between'>
                    <h3 className='text-sm font-semibold'>
                        Ship Market
                        {openBuyingOffers.length + openListings.length > 0 && (
                            <Badge variant='secondary' className='ml-2 text-xs'>
                                {openBuyingOffers.length + openListings.length}
                            </Badge>
                        )}
                    </h3>
                    <PostShipBuyingOfferDialog agentId={agentId} planetId={planetId}>
                        <Button size='sm' variant='outline'>
                            Post Buy Offer
                        </Button>
                    </PostShipBuyingOfferDialog>
                </div>
                {(buyingLoading || listingsLoading) && <p className='text-sm text-muted-foreground'>Loading…</p>}
                {!buyingLoading && !listingsLoading && openBuyingOffers.length === 0 && openListings.length === 0 && (
                    <p className='text-sm text-muted-foreground'>No open ship offers on this planet.</p>
                )}
                {openListings.length > 0 && (
                    <>
                        <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>For Sale</p>
                        {openListings.map((listing) => {
                            const isMyListing = listing._agentId === agentId;
                            return (
                                <Card key={listing.id}>
                                    <CardContent className='px-4 py-4 flex items-center justify-between gap-4'>
                                        <div className='flex items-center gap-3'>
                                            <FacilityOrShipIcon
                                                facilityOrShipName={listing.shipTypeName}
                                                suffix=''
                                                size={80}
                                            />
                                            <div className='text-sm space-y-0.5'>
                                                <p className='font-medium'>{listing.shipName}</p>
                                                <p className='text-muted-foreground'>{listing.shipTypeName}</p>
                                                <p>
                                                    <span className='text-muted-foreground'>Ask price:</span>{' '}
                                                    {listing.askPrice}
                                                </p>
                                            </div>
                                        </div>
                                        {isMyListing ? (
                                            <Badge variant='secondary' className='text-xs'>
                                                Your listing
                                            </Badge>
                                        ) : (
                                            <Button
                                                size='sm'
                                                disabled={acceptListingMutation.isPending}
                                                onClick={() =>
                                                    acceptListingMutation.mutate({
                                                        buyerAgentId: agentId,
                                                        buyerPlanetId: planetId,
                                                        sellerAgentId: listing._agentId,
                                                        listingId: listing.id,
                                                    })
                                                }
                                            >
                                                Buy
                                            </Button>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </>
                )}
                {openBuyingOffers.length > 0 && (
                    <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>Buy Offers</p>
                )}
                {openBuyingOffers.map((offer) => {
                    const isMyOffer = offer._agentId === agentId;
                    const shipTypeDef = allShipTypesByKey[offer.shipType];
                    const idleMatchingShips = idleTransportShipsHere.filter((s) => s.type.name === shipTypeDef?.name);
                    const canSell = !isMyOffer && idleMatchingShips.length > 0;
                    const canSellNoShip = !isMyOffer && idleMatchingShips.length === 0;
                    return (
                        <Card key={offer.id}>
                            <CardContent className='px-4 py-4 flex items-center justify-between gap-4'>
                                <div className='flex items-center gap-3'>
                                    {shipTypeDef && (
                                        <FacilityOrShipIcon facilityOrShipName={shipTypeDef.name} suffix='' size={80} />
                                    )}
                                    <div className='text-sm space-y-0.5'>
                                        <p className='font-medium'>{offer.shipType}</p>
                                        <p>
                                            <span className='text-muted-foreground'>Offered price:</span> {offer.price}
                                        </p>
                                    </div>
                                </div>
                                {canSell && (
                                    <Button size='sm' onClick={() => setAcceptBuyingTarget(offer)}>
                                        Sell
                                    </Button>
                                )}
                                {canSellNoShip && (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span>
                                                    <Button size='sm' disabled>
                                                        Sell
                                                    </Button>
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                No idle {offer.shipType} ship available on this planet
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                )}
                                {isMyOffer && (
                                    <Badge variant='secondary' className='text-xs'>
                                        Your offer
                                    </Badge>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </section>

            {/* Dialogs */}
            {acceptContractTarget && (
                <AcceptTransportContractDialog
                    agentId={agentId}
                    planetId={planetId}
                    contract={acceptContractTarget}
                    eligibleShips={idleTransportShipsHere}
                    open={!!acceptContractTarget}
                    onClose={() => setAcceptContractTarget(null)}
                />
            )}
            {acceptBuyingTarget && (
                <AcceptShipBuyingOfferDialog
                    agentId={agentId}
                    planetId={planetId}
                    offer={acceptBuyingTarget}
                    idleMatchingShips={idleTransportShipsHere.filter(
                        (s) => s.type.name === acceptBuyingTarget.shipType,
                    )}
                    open={!!acceptBuyingTarget}
                    onClose={() => setAcceptBuyingTarget(null)}
                />
            )}
        </div>
    );
}
