'use client';

import { StorageResourceSelect } from '@/components/client/StorageResourceSelect';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTRPC } from '@/lib/trpc';
import type { TransportableResourceType } from '@/simulation/planet/claims';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { PlanetDestinationSelect } from './PlanetDestinationSelect';
import { useShipDispatch } from './useShipDispatch';

type Props = {
    agentId: string;
    planetId: string;
    shipId: string;
    shipName: string;
    shipCargoType: TransportableResourceType;
    children: React.ReactNode;
};

export function DispatchShipDialog({ agentId, planetId, shipId, shipName, shipCargoType, children }: Props) {
    const trpc = useTRPC();
    const markDispatched = useShipDispatch(agentId, planetId, shipId);
    const [open, setOpen] = useState(false);

    const [toPlanetId, setToPlanetId] = useState('');
    const [resourceName, setResourceName] = useState('');
    const [quantity, setQuantity] = useState('');

    const mutation = useMutation(
        trpc.dispatchShip.mutationOptions({
            onSuccess: (data) => {
                markDispatched(data.processedAtTick);
                setOpen(false);
                resetForm();
            },
        }),
    );

    const resetForm = () => {
        setToPlanetId('');
        setResourceName('');
        setQuantity('');
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const cargoGoal = resourceName && quantity ? { resourceName, quantity: Number(quantity) } : null;
        mutation.mutate({
            agentId,
            fromPlanetId: planetId,
            toPlanetId,
            shipId,
            cargoGoal,
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Dispatch {shipName}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className='space-y-4'>
                    <PlanetDestinationSelect fromPlanetId={planetId} value={toPlanetId} onChange={setToPlanetId} />
                    <div className='space-y-1.5'>
                        <Label>Cargo (optional — leave blank to reposition)</Label>
                        <div className='grid grid-cols-2 gap-3'>
                            <div className='space-y-1.5'>
                                <Label className='text-xs text-muted-foreground'>Resource</Label>
                                <StorageResourceSelect
                                    agentId={agentId}
                                    planetId={planetId}
                                    allowedTypes={[shipCargoType]}
                                    value={resourceName}
                                    onValueChange={setResourceName}
                                    placeholder='Select resource…'
                                />
                            </div>
                            <div className='space-y-1.5'>
                                <Label className='text-xs text-muted-foreground'>Quantity</Label>
                                <Input
                                    type='number'
                                    min={1}
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    placeholder='0'
                                />
                            </div>
                        </div>
                    </div>
                    {mutation.isError && (
                        <p className='text-sm text-destructive'>{(mutation.error as unknown as Error).message}</p>
                    )}
                    <DialogFooter>
                        <Button type='submit' disabled={!toPlanetId || mutation.isPending}>
                            {mutation.isPending ? 'Dispatching…' : 'Dispatch'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
