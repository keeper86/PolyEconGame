'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlanetIcon } from '@/components/client/PlanetIcon';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

type Props = {
    agentId: string;
    planetId: string;
    shipName: string;
    passengerCapacity: number;
    children: React.ReactNode;
};

export function DispatchPassengerShipDialog({ agentId, planetId, shipName, passengerCapacity, children }: Props) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);

    const [toPlanetId, setToPlanetId] = useState('');
    const [passengerCount, setPassengerCount] = useState('');

    const { data: planetSummaries } = useSimulationQuery(trpc.simulation.getLatestPlanetSummaries.queryOptions());
    const planets = useMemo(
        () => (planetSummaries?.planets ?? []).filter((p) => p.planetId !== planetId),
        [planetSummaries, planetId],
    );

    const mutation = useMutation(
        trpc.dispatchPassengerShip.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({ queryKey: trpc.listAgentShips.queryKey({ agentId }) });
                setOpen(false);
                setToPlanetId('');
                setPassengerCount('');
            },
        }),
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        mutation.mutate({
            agentId,
            fromPlanetId: planetId,
            toPlanetId,
            shipName,
            passengerCount: Number(passengerCount),
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
                                        <PlanetIcon planetId={p.planetId} />
                                        {p.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className='space-y-1.5'>
                        <Label>Passengers to Board</Label>
                        <Input
                            type='number'
                            min={1}
                            max={passengerCapacity}
                            value={passengerCount}
                            onChange={(e) => setPassengerCount(e.target.value)}
                            placeholder={`1 – ${passengerCapacity.toLocaleString()}`}
                            required
                        />
                        <p className='text-xs text-muted-foreground'>
                            Max capacity: {passengerCapacity.toLocaleString()}
                        </p>
                    </div>
                    {mutation.isError && (
                        <p className='text-sm text-destructive'>{(mutation.error as unknown as Error).message}</p>
                    )}
                    <DialogFooter>
                        <Button
                            type='submit'
                            disabled={
                                !toPlanetId || !passengerCount || Number(passengerCount) < 1 || mutation.isPending
                            }
                        >
                            {mutation.isPending ? 'Dispatching…' : 'Dispatch'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
