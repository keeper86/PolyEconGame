'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';

type MaintenanceOffer = {
    id: string;
    shipName: string;
    price: number;
    maximumTicksAllowed: number;
    _agentId: string;
};

type Props = {
    agentId: string;
    planetId: string;
    offer: MaintenanceOffer;
    open: boolean;
    onClose: () => void;
};

export function AcceptShipMaintenanceOfferDialog({ agentId, planetId, offer, open, onClose }: Props) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const mutation = useMutation(
        trpc.acceptShipMaintenanceOffer.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.listShipMaintenanceOffers.queryKey({ planetId }),
                });
                onClose();
            },
        }),
    );

    const handleAccept = () => {
        mutation.mutate({
            agentId,
            planetId,
            posterAgentId: offer._agentId,
            offerId: offer.id,
        });
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Accept Maintenance Contract</DialogTitle>
                </DialogHeader>
                <div className='text-sm space-y-1'>
                    <p>
                        <span className='text-muted-foreground'>Ship:</span> {offer.shipName}
                    </p>
                    <p>
                        <span className='text-muted-foreground'>Payment:</span> {offer.price}
                    </p>
                    <p>
                        <span className='text-muted-foreground'>Max duration:</span> {offer.maximumTicksAllowed} ticks
                    </p>
                </div>
                {mutation.error && <p className='text-xs text-destructive'>{mutation.error.message}</p>}
                <DialogFooter>
                    <Button onClick={handleAccept} disabled={mutation.isPending}>
                        {mutation.isPending ? 'Accepting…' : 'Accept'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
