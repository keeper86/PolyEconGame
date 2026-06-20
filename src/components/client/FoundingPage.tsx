'use client';

import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { PLANET_LARGE_IMAGES } from '@/lib/planetAssets';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Page } from './Page';

export function FoundingPage() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const router = useRouter();
    const [agentName, setAgentName] = useState('');
    const [planetId, setPlanetId] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const planetsQuery = useQuery(trpc.simulation.getLatestPlanetSummaries.queryOptions());

    useEffect(() => {
        if (!planetId && planetsQuery.data?.planets.length) {
            setPlanetId(planetsQuery.data.planets[0].planetId);
        }
    }, [planetId, planetsQuery.data]);

    const createAgentMutation = useMutation(
        trpc.createAgent.mutationOptions({
            onSuccess: () => {
                setSubmitted(true);
                void queryClient.invalidateQueries({ queryKey: trpc.getUser.queryKey() });
                router.push(`/planets/${encodeURIComponent(planetId)}/central-bank` as unknown as '/');
            },
            onError: (err: unknown) => {
                console.error(err);
            },
        }),
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!planetId) return;
        createAgentMutation.mutate({ agentName: agentName.trim(), planetId });
    };

    if (submitted) {
        return (
            <Page title='Found your Company'>
                <div className='flex items-center gap-3 text-muted-foreground'>
                    <Spinner className='h-5 w-5' />
                    <span>Redirecting…</span>
                </div>
            </Page>
        );
    }

    const planets = planetsQuery.data?.planets ?? [];

    return (
        <Page title='Found your Company'>
            <form onSubmit={handleSubmit} className='grid gap-6 max-w-lg'>
                <div className='grid gap-2'>
                    <Label htmlFor='company-name'>Company Name</Label>
                    <Input
                        id='company-name'
                        placeholder='e.g. Stellar Enterprises'
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        maxLength={64}
                        required
                        disabled={createAgentMutation.isPending}
                    />
                </div>

                <div className='grid gap-2'>
                    <Label>Home Planet</Label>
                    {planetsQuery.isLoading ? (
                        <div className='flex items-center gap-2 text-muted-foreground'>
                            <Spinner className='h-4 w-4' />
                            <span className='text-sm'>Loading planets…</span>
                        </div>
                    ) : (
                        <Carousel className='w-full max-w-md mx-auto'>
                            <CarouselContent>
                                {planets.map((p) => {
                                    const isSelected = p.planetId === planetId;
                                    const watermarkSrc = PLANET_LARGE_IMAGES[p.planetId];

                                    return (
                                        <CarouselItem key={p.planetId} className='basis-full'>
                                            <button
                                                type='button'
                                                onClick={() => setPlanetId(p.planetId)}
                                                className={`relative isolate overflow-hidden rounded-xl border text-left w-full transition-all ${
                                                    isSelected
                                                        ? 'ring-2 ring-primary border-primary shadow-lg'
                                                        : 'border-border hover:border-muted-foreground/50'
                                                }`}
                                            >
                                                {watermarkSrc && (
                                                    <Image
                                                        src={watermarkSrc}
                                                        alt=''
                                                        width={600}
                                                        height={600}
                                                        className='absolute -top-8 -right-8 -z-10 pointer-events-none select-none w-72 h-72 object-contain opacity-40'
                                                        unoptimized
                                                        aria-hidden
                                                    />
                                                )}

                                                <div className='p-5 space-y-3'>
                                                    <h3 className='text-lg font-semibold'>{p.name}</h3>

                                                    <div className='grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm'>
                                                        <span className='text-muted-foreground'>Population</span>
                                                        <span className='text-right font-medium'>
                                                            {formatNumberWithUnit(p.populationTotal, 'persons')}
                                                        </span>

                                                        <span className='text-muted-foreground'>Bank Equity</span>
                                                        <span className='text-right font-medium'>
                                                            {formatNumberWithUnit(p.bank.equity, 'currency', planetId)}
                                                        </span>

                                                        <span className='text-muted-foreground'>Bank Deposits</span>
                                                        <span className='text-right font-medium'>
                                                            {formatNumberWithUnit(p.bank.deposits, 'currency', planetId)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </button>
                                        </CarouselItem>
                                    );
                                })}
                            </CarouselContent>
                            <CarouselPrevious type='button' />
                            <CarouselNext type='button' />
                        </Carousel>
                    )}
                </div>

                <Button type='submit' disabled={createAgentMutation.isPending}>
                    {createAgentMutation.isPending ? (
                        <>
                            <Spinner className='mr-2 h-4 w-4' />
                            Founding…
                        </>
                    ) : (
                        'Found Company'
                    )}
                </Button>
            </form>
        </Page>
    );
}