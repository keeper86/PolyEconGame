'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StorageResourceSelect } from '@/components/client/StorageResourceSelect';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import type { TransportableResourceType } from '@/simulation/planet/claims';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

type Props = {
    agentId: string;
    planetId: string;
    shipName: string;
    shipCargoType: TransportableResourceType;
    children: React.ReactNode;
};

export function DispatchShipDialog({ agentId, planetId, shipName, shipCargoType, children }: Props) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);

    const [toPlanetId, setToPlanetId] = useState('');
    const [resourceName, setResourceName] = useState('');
    const [quantity, setQuantity] = useState('');

    const { data: planetSummaries } = useSimulationQuery(trpc.simulation.getLatestPlanetSummaries.queryOptions());
    const planets = (planetSummaries?.planets ?? []).filter((p) => p.planetId !== planetId);

    const mutation = useMutation(
        trpc.dispatchShip.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({ queryKey: trpc.listAgentShips.queryKey({ agentId }) });
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
            shipName,
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
                    <div className='space-y-1.5'>
                        <Label>Destination Planet</Label>
                        <Select value={toPlanetId} onValueChange={setToPlanetId} required>
                            <SelectTrigger>
                                <SelectValue placeholder='Select destination…' />
                            </SelectTrigger>
                            <SelectContent>
                                {planets.map((p) => (
                                    <SelectItem key={p.planetId} value={p.planetId}>
                                        {p.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
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
