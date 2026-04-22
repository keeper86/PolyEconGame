'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTRPC } from '@/lib/trpc';
import type { TransportShip } from '@/simulation/ships/ships';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

type Contract = {
    id: string;
    fromPlanetId: string;
    toPlanetId: string;
    cargo: { resource: { name: string }; quantity: number };
    offeredReward: number;
    _agentId: string;
};

type Props = {
    agentId: string;
    planetId: string;
    contract: Contract;
    eligibleShips: TransportShip[];
    open: boolean;
    onClose: () => void;
};

export function AcceptTransportContractDialog({ agentId, planetId, contract, eligibleShips, open, onClose }: Props) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [shipName, setShipName] = useState('');

    const mutation = useMutation(
        trpc.acceptTransportContract.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.listTransportContracts.queryKey({ planetId }),
                });
                void queryClient.invalidateQueries({
                    queryKey: trpc.listAgentShips.queryKey({ agentId }),
                });
                onClose();
                setShipName('');
            },
        }),
    );

    const cargoName = contract.cargo.resource.name;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        mutation.mutate({
            agentId,
            planetId,
            posterAgentId: contract._agentId,
            contractId: contract.id,
            shipName,
        });
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Accept Transport Contract</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className='space-y-4'>
                    <div className='text-sm space-y-1'>
                        <p>
                            <span className='text-muted-foreground'>Cargo:</span> {contract.cargo.quantity} ×{' '}
                            {cargoName}
                        </p>
                        <p>
                            <span className='text-muted-foreground'>Destination:</span> {contract.toPlanetId}
                        </p>
                        <p>
                            <span className='text-muted-foreground'>Reward:</span> {contract.offeredReward}
                        </p>
                    </div>
                    <div className='space-y-1.5'>
                        <Label>Ship to assign</Label>
                        <Select value={shipName} onValueChange={setShipName} required>
                            <SelectTrigger>
                                <SelectValue placeholder='Select ship…' />
                            </SelectTrigger>
                            <SelectContent>
                                {eligibleShips.map((s) => (
                                    <SelectItem key={s.name} value={s.name}>
                                        {s.name} ({s.type.name})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {mutation.error && <p className='text-xs text-destructive'>{mutation.error.message}</p>}
                    <DialogFooter>
                        <Button type='submit' disabled={mutation.isPending || !shipName}>
                            {mutation.isPending ? 'Accepting…' : 'Accept Contract'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
