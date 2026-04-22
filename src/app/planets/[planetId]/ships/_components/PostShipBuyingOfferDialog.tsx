'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTRPC } from '@/lib/trpc';
import { shiptypes } from '@/simulation/ships/ships';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

const allShipTypeEntries = Object.values(shiptypes).flatMap((cat) => Object.entries(cat)) as [
    string,
    { name: string },
][];

type Props = {
    agentId: string;
    planetId: string;
    children: React.ReactNode;
};

export function PostShipBuyingOfferDialog({ agentId, planetId, children }: Props) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);

    const [shipType, setShipType] = useState('');
    const [price, setPrice] = useState('');

    const mutation = useMutation(
        trpc.postShipBuyingOffer.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.listShipBuyingOffers.queryKey({ planetId }),
                });
                setOpen(false);
                setShipType('');
                setPrice('');
            },
        }),
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        mutation.mutate({
            agentId,
            planetId,
            shipType,
            price: Number(price),
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Post Ship Buy Offer</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className='space-y-4'>
                    <div className='space-y-1.5'>
                        <Label>Ship Type</Label>
                        <Select value={shipType} onValueChange={setShipType} required>
                            <SelectTrigger>
                                <SelectValue placeholder='Select ship type…' />
                            </SelectTrigger>
                            <SelectContent>
                                {allShipTypeEntries.map(([key, def]) => (
                                    <SelectItem key={key} value={key}>
                                        {def.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className='space-y-1.5'>
                        <Label>Offered Price</Label>
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
                        <Button type='submit' disabled={mutation.isPending || !shipType}>
                            {mutation.isPending ? 'Posting…' : 'Post Buy Offer'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
