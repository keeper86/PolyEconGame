'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAddPendingAction } from '@/hooks/useActionOverlay';
import { useTRPC } from '@/lib/trpc';
import type { TransportShip } from '@/simulation/ships/ships';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

type Offer = {
    id: string;
    shipType: string;
    price: number;
    _agentId: string;
};

type Props = {
    agentId: string;
    planetId: string;
    offer: Offer;

    idleMatchingShips: TransportShip[];
    open: boolean;
    onClose: () => void;
};

export function AcceptShipBuyingOfferDialog({ agentId, planetId, offer, idleMatchingShips, open, onClose }: Props) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const addPending = useAddPendingAction();
    const t = useTranslations('Ships');
    const [shipId, setShipId] = useState('');

    const mutation = useMutation(
        trpc.acceptShipBuyingOffer.mutationOptions({
            onSuccess: (data, variables) => {
                addPending({
                    type: 'shipAcceptBuyOffer',
                    agentId,
                    planetId,
                    shipId: variables.shipId,
                    triggerTick: data.processedAtTick,
                });
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.listShipBuyingOffers.queryKey({ planetId }),
                });
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.listAgentShips.queryKey({ agentId }),
                });
                onClose();
                setShipId('');
            },
        }),
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        mutation.mutate({
            agentId,
            planetId,
            posterAgentId: offer._agentId,
            offerId: offer.id,
            shipId,
        });
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('offer.sellTitle')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className='space-y-4'>
                    <div className='text-sm space-y-1'>
                        <p>
                            <span className='text-muted-foreground'>{t('offer.shipTypeWanted')}</span> {offer.shipType}
                        </p>
                        <p>
                            <span className='text-muted-foreground'>{t('offer.offeredPrice')}</span> {offer.price}
                        </p>
                    </div>
                    <div className='space-y-1.5'>
                        <Label>{t('offer.selectShipToSell')}</Label>
                        <Select value={shipId} onValueChange={setShipId} required>
                            <SelectTrigger>
                                <SelectValue placeholder={t('offer.selectIdleShip')} />
                            </SelectTrigger>
                            <SelectContent>
                                {idleMatchingShips.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                        {s.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {mutation.error && <p className='text-xs text-destructive'>{mutation.error.message}</p>}
                    <DialogFooter>
                        <Button type='submit' disabled={mutation.isPending || !shipId}>
                            {mutation.isPending ? t('offer.selling') : t('offer.sellTitle')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
