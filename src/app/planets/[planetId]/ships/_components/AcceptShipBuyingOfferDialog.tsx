'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTRPC } from '@/lib/trpc';
import type { TransportShip } from '@/simulation/ships/ships';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

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
    /** Seller's idle ships on this planet whose type matches the offer. */
    idleMatchingShips: TransportShip[];
    open: boolean;
    onClose: () => void;
};

export function AcceptShipBuyingOfferDialog({ agentId, planetId, offer, idleMatchingShips, open, onClose }: Props) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [shipName, setShipName] = useState('');

    const mutation = useMutation(
        trpc.acceptShipBuyingOffer.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.listShipBuyingOffers.queryKey({ planetId }),
                });
                void queryClient.invalidateQueries({
                    queryKey: trpc.listAgentShips.queryKey({ agentId }),
                });
                onClose();
                setShipName('');
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
            shipName,
        });
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Sell Ship</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className='space-y-4'>
                    <div className='text-sm space-y-1'>
                        <p>
                            <span className='text-muted-foreground'>Ship type wanted:</span> {offer.shipType}
                        </p>
                        <p>
                            <span className='text-muted-foreground'>Offered price:</span> {offer.price}
                        </p>
                    </div>
                    <div className='space-y-1.5'>
                        <Label>Select ship to sell</Label>
                        <Select value={shipName} onValueChange={setShipName} required>
                            <SelectTrigger>
                                <SelectValue placeholder='Select idle matching ship…' />
                            </SelectTrigger>
                            <SelectContent>
                                {idleMatchingShips.map((s) => (
                                    <SelectItem key={s.name} value={s.name}>
                                        {s.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {mutation.error && <p className='text-xs text-destructive'>{mutation.error.message}</p>}
                    <DialogFooter>
                        <Button type='submit' disabled={mutation.isPending || !shipName}>
                            {mutation.isPending ? 'Selling…' : 'Sell Ship'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
