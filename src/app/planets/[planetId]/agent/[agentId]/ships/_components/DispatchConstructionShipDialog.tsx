'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { ALL_FACILITY_ENTRIES } from '@/simulation/planet/productionFacilities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

const PLACEHOLDER = 'preview';
const facilityNames = ALL_FACILITY_ENTRIES.map((e) => e.factory(PLACEHOLDER, PLACEHOLDER).name).sort();

type Props = {
    agentId: string;
    planetId: string;
    shipName: string;
    children: React.ReactNode;
};

export function DispatchConstructionShipDialog({ agentId, planetId, shipName, children }: Props) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);

    const [toPlanetId, setToPlanetId] = useState('');
    const [facilityName, setFacilityName] = useState('');

    const { data: planetSummaries } = useSimulationQuery(trpc.simulation.getLatestPlanetSummaries.queryOptions());
    const planets = useMemo(
        () => (planetSummaries?.planets ?? []).filter((p) => p.planetId !== planetId),
        [planetSummaries, planetId],
    );

    const mutation = useMutation(
        trpc.dispatchConstructionShip.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({ queryKey: trpc.listAgentShips.queryKey({ agentId }) });
                setOpen(false);
                setToPlanetId('');
                setFacilityName('');
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
            facilityName,
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
                        <Label>Facility to Construct</Label>
                        <Select value={facilityName} onValueChange={setFacilityName} required>
                            <SelectTrigger>
                                <SelectValue placeholder='Select facility…' />
                            </SelectTrigger>
                            <SelectContent>
                                {facilityNames.map((name) => (
                                    <SelectItem key={name} value={name}>
                                        {name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {mutation.isError && (
                        <p className='text-sm text-destructive'>{(mutation.error as unknown as Error).message}</p>
                    )}
                    <DialogFooter>
                        <Button type='submit' disabled={!toPlanetId || !facilityName || mutation.isPending}>
                            {mutation.isPending ? 'Dispatching…' : 'Dispatch'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
