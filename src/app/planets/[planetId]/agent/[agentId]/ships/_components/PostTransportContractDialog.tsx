'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StorageResourceSelect } from '@/components/client/StorageResourceSelect';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

type Props = {
    agentId: string;
    planetId: string;
    tick: number;
    children: React.ReactNode;
};

export function PostTransportContractDialog({ agentId, planetId, tick, children }: Props) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const t = useTranslations('Ships');
    const [open, setOpen] = useState(false);

    const [toPlanetId, setToPlanetId] = useState('');
    const [resourceName, setResourceName] = useState('');
    const [quantity, setQuantity] = useState('');
    const [maxDurationInTicks, setMaxDurationInTicks] = useState('90');
    const [offeredReward, setOfferedReward] = useState('');
    const [expiresInTicks, setExpiresInTicks] = useState('30');

    const { data: planetSummaries } = useSimulationQuery(trpc.simulation.getLatestPlanetSummaries.queryOptions());
    const planets = (planetSummaries?.planets ?? []).filter((p) => p.planetId !== planetId);

    const mutation = useMutation(
        trpc.postTransportContract.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.listTransportContracts.queryKey({ planetId }),
                });
                setOpen(false);
                resetForm();
            },
        }),
    );

    const resetForm = () => {
        setToPlanetId('');
        setResourceName('');
        setQuantity('');
        setMaxDurationInTicks('90');
        setOfferedReward('');
        setExpiresInTicks('30');
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        mutation.mutate({
            agentId,
            planetId,
            toPlanetId,
            cargo: { resourceName, quantity: Number(quantity) },
            maxDurationInTicks: Number(maxDurationInTicks),
            offeredReward: Number(offeredReward),
            expiresAtTick: tick + Number(expiresInTicks),
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('contract.postTitle')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className='space-y-4'>
                    <div className='space-y-1.5'>
                        <Label>{t('destination')}</Label>
                        <Select value={toPlanetId} onValueChange={setToPlanetId} required>
                            <SelectTrigger>
                                <SelectValue placeholder={t('selectDestination')} />
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
                    <div className='grid grid-cols-2 gap-3'>
                        <div className='space-y-1.5'>
                            <Label>{t('resource')}</Label>
                            <StorageResourceSelect
                                agentId={agentId}
                                planetId={planetId}
                                value={resourceName}
                                onValueChange={setResourceName}
                                required
                            />
                        </div>
                        <div className='space-y-1.5'>
                            <Label>{t('quantity')}</Label>
                            <Input
                                type='number'
                                min={1}
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                placeholder='0'
                                required
                            />
                        </div>
                    </div>
                    <div className='grid grid-cols-2 gap-3'>
                        <div className='space-y-1.5'>
                            <Label>{t('contract.maxDuration')}</Label>
                            <Input
                                type='number'
                                min={1}
                                value={maxDurationInTicks}
                                onChange={(e) => setMaxDurationInTicks(e.target.value)}
                                required
                            />
                        </div>
                        <div className='space-y-1.5'>
                            <Label>{t('contract.expiresIn')}</Label>
                            <Input
                                type='number'
                                min={1}
                                value={expiresInTicks}
                                onChange={(e) => setExpiresInTicks(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <div className='space-y-1.5'>
                        <Label>{t('contract.offeredReward')}</Label>
                        <Input
                            type='number'
                            min={0}
                            value={offeredReward}
                            onChange={(e) => setOfferedReward(e.target.value)}
                            placeholder='0'
                            required
                        />
                        <p className='text-xs text-muted-foreground'>{t('contract.escrowNote')}</p>
                    </div>
                    {mutation.error && <p className='text-xs text-destructive'>{mutation.error.message}</p>}
                    <DialogFooter>
                        <Button type='submit' disabled={mutation.isPending}>
                            {mutation.isPending ? t('market.posting') : t('market.postContract')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
