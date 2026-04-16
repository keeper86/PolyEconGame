'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTRPC } from '@/lib/trpc';
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
    open: boolean;
    onClose: () => void;
};

export function AcceptShipBuyingOfferDialog({ agentId, planetId, offer, open, onClose }: Props) {
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
                    <DialogTitle>Buy Ship</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className='space-y-4'>
                    <div className='text-sm space-y-1'>
                        <p>
                            <span className='text-muted-foreground'>Ship type:</span> {offer.shipType}
                        </p>
                        <p>
                            <span className='text-muted-foreground'>Price:</span> {offer.price}
                        </p>
                    </div>
                    <div className='space-y-1.5'>
                        <Label>Give your new ship a name</Label>
                        <Input
                            value={shipName}
                            onChange={(e) => setShipName(e.target.value)}
                            placeholder='e.g. Stellar Wind'
                            required
                        />
                    </div>
                    {mutation.error && <p className='text-xs text-destructive'>{mutation.error.message}</p>}
                    <DialogFooter>
                        <Button type='submit' disabled={mutation.isPending || !shipName}>
                            {mutation.isPending ? 'Buying…' : 'Buy Ship'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
