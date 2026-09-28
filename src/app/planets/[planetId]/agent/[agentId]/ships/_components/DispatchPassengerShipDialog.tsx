'use client';

import { formatNumberWithUnit } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTRPC } from '@/lib/trpc';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { PlanetDestinationSelect } from './PlanetDestinationSelect';
import { useShipDispatch } from './useShipDispatch';
import { useLocale } from 'next-intl';

type Props = {
    agentId: string;
    planetId: string;
    shipId: string;
    shipName: string;
    passengerCapacity: number;
    children: React.ReactNode;
};

export function DispatchPassengerShipDialog({
    agentId,
    planetId,
    shipId,
    shipName,
    passengerCapacity,
    children,
}: Props) {
    const locale = useLocale();
    const trpc = useTRPC();
    const markDispatched = useShipDispatch(agentId, planetId, shipId);
    const [open, setOpen] = useState(false);

    const [toPlanetId, setToPlanetId] = useState('');
    const [passengerCount, setPassengerCount] = useState('');

    const mutation = useMutation(
        trpc.dispatchPassengerShip.mutationOptions({
            onSuccess: (data) => {
                markDispatched(data.processedAtTick);
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
            shipId,
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
                    <PlanetDestinationSelect fromPlanetId={planetId} value={toPlanetId} onChange={setToPlanetId} />
                    <div className='space-y-1.5'>
                        <Label>Passengers to Board</Label>
                        <Input
                            type='number'
                            min={0}
                            max={passengerCapacity}
                            value={passengerCount}
                            onChange={(e) => setPassengerCount(e.target.value)}
                            placeholder={`0 – ${formatNumberWithUnit(passengerCapacity, 'persons', undefined, locale)}`}
                        />
                        <p className='text-xs text-muted-foreground'>
                            Max capacity: {formatNumberWithUnit(passengerCapacity, 'persons', undefined, locale)}
                        </p>
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
