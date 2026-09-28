'use client';

import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { ProductQuantity } from '@/components/client/ProductQuantity';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatNumberWithUnit } from '@/lib/utils';
import { useAddPendingAction } from '@/hooks/useActionOverlay';
import { useTRPC } from '@/lib/trpc';
import { shiptypes } from '@/simulation/ships/ships';
import type { Ship, TransportShip } from '@/simulation/ships/ships';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { CardHeaderBlock } from '../../_component/CardHeaderBlock';
import { FacilityCardShell } from '../../production/_component/FacilityCardShell';
import { AcceptShipBuyingOfferDialog } from './AcceptShipBuyingOfferDialog';
import { AcceptTransportContractDialog } from './AcceptTransportContractDialog';
import { PlanetRoute, PlanetRouteIcon } from './PlanetRoute';
import { PostShipBuyingOfferDialog } from './PostShipBuyingOfferDialog';
import { PostTransportContractDialog } from './PostTransportContractDialog';
import { ShipConditionRow } from './ShipConditionRow';
import type { PlanetSummary } from './shipFormatting';
import type { ShipBuyingOffer, ShipListing, TransportContract } from './shipTypes';
import { useLocale, useTranslations } from 'next-intl';

const allShipTypesByKey = Object.fromEntries(Object.values(shiptypes).flatMap((cat) => Object.entries(cat))) as Record<
    string,
    { name: string }
>;

function SectionHeader({
    title,
    count,
    children,
}: {
    title: string;
    count: number;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <div className='flex items-center justify-between'>
            <h3 className='text-sm font-semibold'>
                {title}
                {count > 0 && (
                    <Badge variant='secondary' className='ml-2 text-xs'>
                        {count}
                    </Badge>
                )}
            </h3>
            {children}
        </div>
    );
}

export function ShipMarketTab({
    agentId,
    planetId,
    tick,
    ships,
    listings,
    contracts,
    offers,
    planetSummaries,
    contractsLoading,
    offersLoading,
    listingsLoading,
}: {
    agentId: string;
    planetId: string;
    tick: number;
    ships: Ship[];
    listings: ShipListing[];
    contracts: TransportContract[];
    offers: ShipBuyingOffer[];
    planetSummaries: PlanetSummary[];
    contractsLoading: boolean;
    offersLoading: boolean;
    listingsLoading: boolean;
}): React.ReactElement {
    const locale = useLocale();
    const t = useTranslations('Ships');
    const tc = useTranslations('Common');
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const addPending = useAddPendingAction();

    const idleTransportShipsHere = ships.filter(
        (s): s is TransportShip =>
            s.state.type === 'idle' && s.state.planetId === planetId && s.type.type === 'transport',
    );

    const [acceptContractTarget, setAcceptContractTarget] = useState<TransportContract | null>(null);
    const [acceptBuyingTarget, setAcceptBuyingTarget] = useState<ShipBuyingOffer | null>(null);

    const cancelContractMutation = useMutation(
        trpc.cancelTransportContract.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.listTransportContracts.queryKey({ planetId }),
                });
            },
        }),
    );

    const acceptListingMutation = useMutation(
        trpc.acceptShipListing.mutationOptions({
            onSuccess: (data, variables) => {
                const listing = listings.find((l) => l.id === variables.listingId);
                if (listing) {
                    addPending({
                        type: 'shipAccept',
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

    const openContracts = contracts.filter((c) => c.status === 'open');
    const openBuyingOffers = offers.filter((o) => o.status === 'open');
    const openListings = listings;

    return (
        <div className='space-y-6 mt-3'>
            <section className='space-y-3'>
                <SectionHeader title={t('market.transportContracts')} count={openContracts.length}>
                    <PostTransportContractDialog agentId={agentId} planetId={planetId} tick={tick}>
                        <Button size='sm' variant='outline'>
                            {t('market.postContract')}
                        </Button>
                    </PostTransportContractDialog>
                </SectionHeader>
                {contractsLoading && <p className='text-sm text-muted-foreground'>{t('market.loadingContracts')}</p>}
                {!contractsLoading && openContracts.length === 0 && (
                    <p className='text-sm text-muted-foreground'>{t('market.noContracts')}</p>
                )}
                <div className='flex flex-row gap-3 flex-wrap'>
                    {openContracts.map((contract) => {
                        const isMyContract = contract._agentId === agentId;
                        const hasEligibleShip = idleTransportShipsHere.length > 0;
                        return (
                            <FacilityCardShell
                                key={contract.id}
                                contentClassName='flex flex-col flex-1 gap-2'
                                icon={
                                    <PlanetRouteIcon
                                        fromPlanetId={contract.fromPlanetId}
                                        toPlanetId={contract.toPlanetId}
                                    />
                                }
                                headerContent={
                                    <CardHeaderBlock
                                        title={
                                            <PlanetRoute
                                                fromPlanetId={contract.fromPlanetId}
                                                toPlanetId={contract.toPlanetId}
                                                planetSummaries={planetSummaries}
                                            />
                                        }
                                        titleClassName=''
                                        badge={
                                            <Badge variant='outline' className='text-[10px] px-1.5 py-0'>
                                                {contract.status}
                                            </Badge>
                                        }
                                        details={
                                            <span className='flex flex-wrap items-center gap-2'>
                                                <ProductQuantity
                                                    resource={contract.cargo.resource}
                                                    quantity={contract.cargo.quantity}
                                                    efficiency={1}
                                                    isLimiting={false}
                                                    planetId={planetId}
                                                    agentId={agentId}
                                                />
                                                <span>
                                                    {t('market.reward')}{' '}
                                                    {formatNumberWithUnit(
                                                        contract.offeredReward,
                                                        'currency',
                                                        planetId,
                                                        locale,
                                                    )}
                                                </span>
                                                <span>
                                                    {t('market.maxDays', { days: contract.maxDurationInTicks })}
                                                </span>
                                            </span>
                                        }
                                    />
                                }
                            >
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
                                            {tc('cancel')}
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
                                                            {t('market.accept')}
                                                        </Button>
                                                    </span>
                                                </TooltipTrigger>
                                                {!hasEligibleShip && (
                                                    <TooltipContent>{t('market.noIdleShip')}</TooltipContent>
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
                <SectionHeader title={t('market.title')} count={openBuyingOffers.length + openListings.length}>
                    <PostShipBuyingOfferDialog agentId={agentId} planetId={planetId}>
                        <Button size='sm' variant='outline'>
                            {t('offer.postBuyOffer')}
                        </Button>
                    </PostShipBuyingOfferDialog>
                </SectionHeader>
                {(offersLoading || listingsLoading) && <p className='text-sm text-muted-foreground'>{tc('loading')}</p>}
                {!offersLoading && !listingsLoading && openBuyingOffers.length === 0 && openListings.length === 0 && (
                    <p className='text-sm text-muted-foreground'>{t('market.noOffers')}</p>
                )}

                {openListings.length > 0 && (
                    <>
                        <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                            {t('market.forSale')}
                        </p>
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
                                            <CardHeaderBlock
                                                title={listing.shipName}
                                                titleClassName=''
                                                badge={
                                                    isMyListing ? (
                                                        <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
                                                            {t('market.yourListing')}
                                                        </Badge>
                                                    ) : null
                                                }
                                                details={
                                                    <>
                                                        <span>{listing.shipTypeName}</span>
                                                        {listing.maintainanceStatus !== undefined &&
                                                            listing.maxMaintenance !== undefined && (
                                                                <ShipConditionRow
                                                                    ship={{
                                                                        maintainanceStatus: listing.maintainanceStatus,
                                                                        maxMaintenance: listing.maxMaintenance,
                                                                    }}
                                                                />
                                                            )}
                                                        <span>
                                                            {t('market.ask')}{' '}
                                                            {formatNumberWithUnit(
                                                                listing.askPrice,
                                                                'currency',
                                                                planetId,
                                                                locale,
                                                            )}
                                                        </span>
                                                    </>
                                                }
                                            />
                                        }
                                    >
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
                                                    {t('market.buy')}
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
                            {t('market.buyOffers')}
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
                                            <CardHeaderBlock
                                                title={shipTypeDef?.name ?? offer.shipType}
                                                titleClassName=''
                                                badge={
                                                    isMyOffer ? (
                                                        <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
                                                            {t('market.yourOffer')}
                                                        </Badge>
                                                    ) : null
                                                }
                                                details={
                                                    <span>
                                                        {t('market.offered')}{' '}
                                                        {formatNumberWithUnit(
                                                            offer.price,
                                                            'currency',
                                                            planetId,
                                                            locale,
                                                        )}
                                                    </span>
                                                }
                                            />
                                        }
                                    >
                                        {canSell && (
                                            <div className='mt-auto space-y-2'>
                                                <Separator />
                                                <Button
                                                    size='sm'
                                                    className='w-full text-xs'
                                                    onClick={() => setAcceptBuyingTarget(offer)}
                                                >
                                                    {t('market.sell')}
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
                                                                    {t('market.sell')}
                                                                </Button>
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            {t('market.noIdleShipType', { shipType: offer.shipType })}
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
