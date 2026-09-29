'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useErrorMessage } from '@/i18n/errors';
import { termFor } from '@/i18n/terms';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTRPC } from '@/lib/trpc';
import type { TransportShip } from '@/simulation/ships/ships';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

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
    const t = useTranslations('Ships');
    const locale = useLocale();
    const showError = useErrorMessage();
    const [shipId, setShipId] = useState('');

    const mutation = useMutation(
        trpc.acceptTransportContract.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.listTransportContracts.queryKey({ planetId }),
                });
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.listAgentShips.queryKey({ agentId }),
                });
                onClose();
                setShipId('');
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
            shipId,
        });
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('contract.acceptTitle')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className='space-y-4'>
                    <div className='text-sm space-y-1'>
                        <p>
                            <span className='text-muted-foreground'>{t('contract.cargo')}</span>{' '}
                            {contract.cargo.quantity} × {cargoName}
                        </p>
                        <p>
                            <span className='text-muted-foreground'>{t('contract.destination')}</span>{' '}
                            {contract.toPlanetId}
                        </p>
                        <p>
                            <span className='text-muted-foreground'>{t('contract.reward')}</span>{' '}
                            {contract.offeredReward}
                        </p>
                    </div>
                    <div className='space-y-1.5'>
                        <Label>{t('contract.shipToAssign')}</Label>
                        <Select value={shipId} onValueChange={setShipId} required>
                            <SelectTrigger>
                                <SelectValue placeholder={t('contract.selectShip')} />
                            </SelectTrigger>
                            <SelectContent>
                                {eligibleShips.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                        {s.name} ({termFor(locale, s.type.name)})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {mutation.error && <p className='text-xs text-destructive'>{showError(mutation.error)}</p>}
                    <DialogFooter>
                        <Button type='submit' disabled={mutation.isPending || !shipId}>
                            {mutation.isPending ? t('market.accepting') : t('market.acceptContract')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
