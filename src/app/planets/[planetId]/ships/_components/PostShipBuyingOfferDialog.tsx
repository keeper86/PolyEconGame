'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTRPC } from '@/lib/trpc';
import type { TransportShip } from '@/simulation/ships/ships';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

type Props = {
    agentId: string;
    planetId: string;
    idleShips: TransportShip[];
    children: React.ReactNode;
};

export function PostShipBuyingOfferDialog({ agentId, planetId, idleShips, children }: Props) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);

    const [shipName, setShipName] = useState('');
    const [price, setPrice] = useState('');

    const mutation = useMutation(
        trpc.postShipBuyingOffer.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.listShipBuyingOffers.queryKey({ planetId }),
                });
                void queryClient.invalidateQueries({
                    queryKey: trpc.listAgentShips.queryKey({ agentId }),
                });
                setOpen(false);
                setShipName('');
                setPrice('');
            },
        }),
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        mutation.mutate({
            agentId,
            planetId,
            shipType: idleShips.find((s) => s.name === shipName)?.type.name ?? shipName,
            price: Number(price),
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Post Ship for Sale</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className='space-y-4'>
                    <div className='space-y-1.5'>
                        <Label>Ship</Label>
                        <Select value={shipName} onValueChange={setShipName} required>
                            <SelectTrigger>
                                <SelectValue placeholder='Select idle ship…' />
                            </SelectTrigger>
                            <SelectContent>
                                {idleShips.map((s) => (
                                    <SelectItem key={s.name} value={s.name}>
                                        {s.name} ({s.type.name})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className='space-y-1.5'>
                        <Label>Asking Price</Label>
                        <Input
                            type='number'
                            min={1}
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            placeholder='0'
                            required
                        />
                    </div>
                    {mutation.error && <p className='text-xs text-destructive'>{mutation.error.message}</p>}
                    <DialogFooter>
                        <Button type='submit' disabled={mutation.isPending}>
                            {mutation.isPending ? 'Posting…' : 'Post for Sale'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
