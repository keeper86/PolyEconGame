'use client';

import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useTRPC } from '@/lib/trpc';
import { termFor } from '@/i18n/terms';
import { FACILITY_LEVELS, facilitiesByLevel } from '@/simulation/planet/productionFacilities';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { PlanetDestinationSelect } from './PlanetDestinationSelect';
import { useShipDispatch } from './useShipDispatch';

const FACILITY_LEVEL_LABEL_KEYS = {
    raw: 'facilityRaw',
    refined: 'facilityRefined',
    manufactured: 'facilityManufactured',
    services: 'facilityServices',
    internal: 'facilityInternal',
} as const;

type Props = {
    agentId: string;
    planetId: string;
    shipId: string;
    shipName: string;
    children: React.ReactNode;
};

export function DispatchConstructionShipDialog({ agentId, planetId, shipId, shipName, children }: Props) {
    const trpc = useTRPC();
    const markDispatched = useShipDispatch(agentId, planetId, shipId);
    const t = useTranslations('Ships');
    const tc = useTranslations('Common');
    const tl = useTranslations('Levels');
    const locale = useLocale();
    const [open, setOpen] = useState(false);

    const [toPlanetId, setToPlanetId] = useState('');
    const [facilityName, setFacilityName] = useState<string | undefined>(undefined);

    const mutation = useMutation(
        trpc.dispatchConstructionShip.mutationOptions({
            onSuccess: (data) => {
                markDispatched(data.processedAtTick);
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
            shipId,
            facilityName,
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('dispatch.title', { shipName })}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className='space-y-4'>
                    <PlanetDestinationSelect fromPlanetId={planetId} value={toPlanetId} onChange={setToPlanetId} />
                    <div className='space-y-1.5'>
                        <Label>{t('dispatch.facilityToConstruct')}</Label>
                        <div className='max-h-[420px] overflow-y-auto rounded-md border'>
                            <Accordion type='single' collapsible className='px-3'>
                                {FACILITY_LEVELS.map((level) => (
                                    <AccordionItem key={level} value={level}>
                                        <AccordionTrigger>{tl(FACILITY_LEVEL_LABEL_KEYS[level])}</AccordionTrigger>
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
                                                            <span className='text-xs leading-tight'>
                                                                {termFor(locale, name)}
                                                            </span>
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
                            {mutation.isPending ? t('dispatch.dispatching') : tc('dispatch')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
