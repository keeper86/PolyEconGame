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

export function PostShipMaintenanceOfferDialog({ agentId, planetId, idleShips, children }: Props) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);

    const [shipName, setShipName] = useState('');
    const [price, setPrice] = useState('');
    const [maximumTicksAllowed, setMaximumTicksAllowed] = useState('30');

    const mutation = useMutation(
        trpc.postShipMaintenanceOffer.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.listShipMaintenanceOffers.queryKey({ planetId }),
                });
                setOpen(false);
                setShipName('');
                setPrice('');
                setMaximumTicksAllowed('30');
            },
        }),
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        mutation.mutate({
            agentId,
            planetId,
            shipName,
            price: Number(price),
            maximumTicksAllowed: Number(maximumTicksAllowed),
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Request Maintenance</DialogTitle>
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
                                        {s.name} — {Math.round(s.maintainanceStatus * 100)}% condition
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className='grid grid-cols-2 gap-3'>
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
                        <div className='space-y-1.5'>
                            <Label>Max Duration (ticks)</Label>
                            <Input
                                type='number'
                                min={1}
                                value={maximumTicksAllowed}
                                onChange={(e) => setMaximumTicksAllowed(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    {mutation.error && <p className='text-xs text-destructive'>{mutation.error.message}</p>}
                    <DialogFooter>
                        <Button type='submit' disabled={mutation.isPending}>
                            {mutation.isPending ? 'Posting…' : 'Request Maintenance'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
