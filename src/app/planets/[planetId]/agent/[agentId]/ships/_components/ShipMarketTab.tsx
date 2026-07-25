'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TransportShip } from '@/simulation/ships/ships';
import { shiptypes } from '@/simulation/ships/ships';
import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { defaultHeight } from '@/components/client/FacilityOrShipIcon';
import { FacilityCardShell } from '../../production/_component/FacilityCardShell';
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
                <div className='flex flex-row gap-3 flex-wrap'>
                    {openContracts.map((contract) => {
                        const isMyContract = contract._agentId === agentId;
                        const cargoName = contract.cargo.resource.name;
                        const hasEligibleShip = idleTransportShipsHere.length > 0;
                        return (
                            <FacilityCardShell
                                key={contract.id}
                                contentClassName='flex flex-col flex-1 gap-2'
                                icon={
                                    <div className='text-xs font-bold text-muted-foreground flex items-center justify-center h-12 w-12 rounded bg-muted'>
                                        {contract.fromPlanetId}
                                        <br />→<br />
                                        {contract.toPlanetId}
                                    </div>
                                }
                                headerContent={
                                    <span className='flex flex-col gap-2' style={{ minHeight: `${defaultHeight}px` }}>
                                        <div className='flex items-center gap-1 flex-col mb-1'>
                                            <h3 className='font-semibold leading-tight text-sm'>
                                                {contract.fromPlanetId} → {contract.toPlanetId}
                                            </h3>
                                            <Badge variant='outline' className='text-[10px] px-1.5 py-0'>
                                                {contract.status}
                                            </Badge>
                                        </div>
                                    </span>
                                }
                            >
                                <div className='flex-1 space-y-1 text-xs text-muted-foreground'>
                                    <p>
                                        Cargo: {contract.cargo.quantity} × {cargoName}
                                    </p>
                                    <p>Reward: {contract.offeredReward}</p>
                                    <p>Max duration: {contract.maxDurationInTicks} ticks</p>
                                </div>

                                <div className='mt-auto space-y-2'>
                                    <Separator />
                                    {isMyContract && (
                                        <Button
                                            variant='destructive'
                                            size='sm'
                                            className='w-full text-xs'
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
                                                    <span className='block'>
                                                        <Button
                                                            size='sm'
                                                            className='w-full text-xs'
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
                            </FacilityCardShell>
                        );
                    })}
                </div>
            </section>

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
                        <div className='flex flex-row gap-3 flex-wrap'>
                            {openListings.map((listing) => {
                                const isMyListing = listing._agentId === agentId;
                                return (
                                    <FacilityCardShell
                                        key={listing.id}
                                        contentClassName='flex flex-col flex-1 gap-2'
                                        icon={
                                            <FacilityOrShipIcon
                                                facilityOrShipName={listing.shipTypeName}
                                                suffix=''
                                                size={240}
                                            />
                                        }
                                        headerContent={
                                            <span
                                                className='flex flex-col gap-2'
                                                style={{ minHeight: `${defaultHeight}px` }}
                                            >
                                                <div className='flex items-center gap-1 flex-col mb-1'>
                                                    <h3 className='font-semibold leading-tight'>{listing.shipName}</h3>
                                                    {isMyListing && (
                                                        <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
                                                            Your listing
                                                        </Badge>
                                                    )}
                                                </div>
                                            </span>
                                        }
                                    >
                                        <div className='flex-1 space-y-1 text-xs text-muted-foreground'>
                                            <p>{listing.shipTypeName}</p>
                                            <p>Ask price: {listing.askPrice}</p>
                                        </div>

                                        {!isMyListing && (
                                            <div className='mt-auto space-y-2'>
                                                <Separator />
                                                <Button
                                                    size='sm'
                                                    className='w-full text-xs'
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
                                            </div>
                                        )}
                                    </FacilityCardShell>
                                );
                            })}
                        </div>
                    </>
                )}

                {openBuyingOffers.length > 0 && (
                    <>
                        <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide mt-3'>
                            Buy Offers
                        </p>
                        <div className='flex flex-row gap-3 flex-wrap'>
                            {openBuyingOffers.map((offer) => {
                                const isMyOffer = offer._agentId === agentId;
                                const shipTypeDef = allShipTypesByKey[offer.shipType];
                                const idleMatchingShips = idleTransportShipsHere.filter(
                                    (s) => s.type.name === shipTypeDef?.name,
                                );
                                const canSell = !isMyOffer && idleMatchingShips.length > 0;
                                const canSellNoShip = !isMyOffer && idleMatchingShips.length === 0;
                                return (
                                    <FacilityCardShell
                                        key={offer.id}
                                        contentClassName='flex flex-col flex-1 gap-2'
                                        icon={
                                            shipTypeDef ? (
                                                <FacilityOrShipIcon
                                                    facilityOrShipName={shipTypeDef.name}
                                                    suffix=''
                                                    size={80}
                                                />
                                            ) : (
                                                <div className='h-12 w-12 rounded bg-muted' />
                                            )
                                        }
                                        headerContent={
                                            <span
                                                className='flex flex-col gap-2'
                                                style={{ minHeight: `${defaultHeight}px` }}
                                            >
                                                <div className='flex items-center gap-1 flex-col mb-1'>
                                                    <h3 className='font-semibold leading-tight'>{offer.shipType}</h3>
                                                    {isMyOffer && (
                                                        <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
                                                            Your offer
                                                        </Badge>
                                                    )}
                                                </div>
                                            </span>
                                        }
                                    >
                                        <div className='flex-1 space-y-1 text-xs text-muted-foreground'>
                                            <p>Offered price: {offer.price}</p>
                                        </div>

                                        {canSell && (
                                            <div className='mt-auto space-y-2'>
                                                <Separator />
                                                <Button
                                                    size='sm'
                                                    className='w-full text-xs'
                                                    onClick={() => setAcceptBuyingTarget(offer)}
                                                >
                                                    Sell
                                                </Button>
                                            </div>
                                        )}
                                        {canSellNoShip && (
                                            <div className='mt-auto space-y-2'>
                                                <Separator />
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className='block'>
                                                                <Button size='sm' className='w-full text-xs' disabled>
                                                                    Sell
                                                                </Button>
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            No idle {offer.shipType} ship available on this planet
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                        )}
                                    </FacilityCardShell>
                                );
                            })}
                        </div>
                    </>
                )}
            </section>

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
