'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { useTRPC } from '@/lib/trpc';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { FACILITY_LEVELS, FACILITY_LEVEL_LABELS, facilitiesByLevel } from '@/simulation/planet/productionFacilities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { PlanetIcon } from '@/components/client/PlanetIcon';

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
    const [facilityName, setFacilityName] = useState<string | undefined>(undefined);

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
                setFacilityName(undefined);
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
                                        <PlanetIcon planetId={p.planetId} />
                                        {p.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className='space-y-1.5'>
                        <Label>Facility to Construct</Label>
                        <div className='max-h-[420px] overflow-y-auto rounded-md border'>
                            <Accordion type='single' collapsible className='px-3'>
                                {FACILITY_LEVELS.map((level) => (
                                    <AccordionItem key={level} value={level}>
                                        <AccordionTrigger>{FACILITY_LEVEL_LABELS[level]}</AccordionTrigger>
                                        <AccordionContent>
                                            <div className='grid grid-cols-2 gap-3 pb-2'>
                                                {facilitiesByLevel[level].map((entry) => {
                                                    const name = entry.factory('catalog', 'preview').name;
                                                    const selected = facilityName === name;
                                                    return (
                                                        <button
                                                            key={name}
                                                            type='button'
                                                            onClick={() => setFacilityName(name)}
                                                            className={`flex flex-col items-center gap-2 rounded-md border p-2 text-center transition-colors hover:bg-accent ${selected ? 'border-primary bg-accent' : 'border-transparent'}`}
                                                        >
                                                            <FacilityOrShipIcon facilityOrShipName={name} size={120} />
                                                            <span className='text-xs leading-tight'>{name}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
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
