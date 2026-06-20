'use client';

import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi, useCarousel } from '@/components/ui/carousel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { PLANET_LARGE_IMAGES } from '@/lib/planetAssets';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { getLandboundRessourceByName } from '@/simulation/planet/landBoundResources';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Page } from './Page';
import { ProductQuantity } from './ProductQuantity';

function CarouselNav() {
    const { scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel();

    return (
        <div className='absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between p-3 sm:p-5  pointer-events-none rounded-b-xl'>
            <button
                type='button'
                onClick={scrollPrev}
                disabled={!canScrollPrev}
                className='pointer-events-auto inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow hover:bg-primary/90 h-8 w-8 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer'
            >
                <ChevronLeft className='h-4 w-4' />
                <span className='sr-only'>Previous planet</span>
            </button>

            <button
                type='button'
                onClick={scrollNext}
                disabled={!canScrollNext}
                className='pointer-events-auto inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow hover:bg-primary/90 h-8 w-8 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer'
            >
                <ChevronRight className='h-4 w-4' />
                <span className='sr-only'>Next planet</span>
            </button>
        </div>
    );
}

export function FoundingPage() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const router = useRouter();
    const [agentName, setAgentName] = useState('');
    const [planetId, setPlanetId] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);

    const planetsQuery = useQuery(trpc.simulation.getLatestPlanetSummaries.queryOptions());

    const onCarouselSelect = useCallback(
        (api: CarouselApi) => {
            if (!api || !planetsQuery.data) {
                return;
            }
            const index = api.selectedScrollSnap();
            const planet = planetsQuery.data.planets[index];
            if (planet) {
                setPlanetId(planet.planetId);
            }
        },
        [planetsQuery.data],
    );

    useEffect(() => {
        if (!carouselApi || !planetsQuery.data) {
            return;
        }
        carouselApi.on('select', onCarouselSelect);
        return () => {
            carouselApi.off('select', onCarouselSelect);
        };
    }, [carouselApi, onCarouselSelect, planetsQuery.data]);

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
        if (!planetId) {
            return;
        }
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
                    <Input
                        placeholder='Your company name'
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        maxLength={64}
                        required
                        disabled={createAgentMutation.isPending}
                    />
                </div>

                <div className='grid gap-2'>
                    {planetsQuery.isLoading ? (
                        <div className='flex items-center gap-2 text-muted-foreground'>
                            <Spinner className='h-4 w-4' />
                            <span className='text-sm'>Loading planets…</span>
                        </div>
                    ) : (
                        <Carousel setApi={setCarouselApi}>
                            <CarouselContent>
                                {planets.map((p) => {
                                    const isSelected = p.planetId === planetId;
                                    const watermarkSrc = PLANET_LARGE_IMAGES[p.planetId];

                                    const minWage = Math.min(p.wageEdu0, p.wageEdu1, p.wageEdu2, p.wageEdu3);
                                    const maxWage = Math.max(p.wageEdu0, p.wageEdu1, p.wageEdu2, p.wageEdu3);

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

                                                <div className='p-3 sm:p-5 pb-16 space-y-3 min-h-[500px]'>
                                                    <h3 className='text-xl font-semibold'>{p.name}</h3>

                                                    <div className='grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-outline-strong'>
                                                        <span className='text-muted-foreground'>Population</span>
                                                        <span className='text-right font-medium'>
                                                            {formatNumberWithUnit(p.populationTotal, 'persons')}
                                                        </span>

                                                        <span className='text-muted-foreground'>GDP</span>
                                                        <span className='text-right font-medium'>
                                                            {formatNumberWithUnit(p.gdp, 'currency', p.planetId)}
                                                        </span>

                                                        <span className='text-muted-foreground'>Money Supply</span>
                                                        <span className='text-right font-medium'>
                                                            {formatNumberWithUnit(
                                                                p.moneySupply,
                                                                'currency',
                                                                p.planetId,
                                                            )}
                                                        </span>

                                                        <span className='text-muted-foreground'>Bank Equity</span>
                                                        <span className='text-right font-medium'>
                                                            {formatNumberWithUnit(
                                                                p.bank.equity,
                                                                'currency',
                                                                p.planetId,
                                                            )}
                                                        </span>

                                                        <span className='text-muted-foreground'>Interest Rate</span>
                                                        <span className='text-right font-medium tabular-nums'>
                                                            {(p.policyRate * 100).toFixed(2)} %
                                                        </span>

                                                        <span className='text-muted-foreground'>Cost of Living</span>
                                                        <span className='text-right font-medium'>
                                                            {formatNumberWithUnit(
                                                                p.costOfLiving,
                                                                'currency',
                                                                p.planetId,
                                                            )}
                                                            {' – '}
                                                            {formatNumberWithUnit(
                                                                p.costOfLivingRich,
                                                                'currency',
                                                                p.planetId,
                                                            )}
                                                        </span>

                                                        <span className='text-muted-foreground'>Wages</span>
                                                        <span className='text-right font-medium'>
                                                            {formatNumberWithUnit(minWage, 'currency', p.planetId)}
                                                            {' – '}
                                                            {formatNumberWithUnit(maxWage, 'currency', p.planetId)}
                                                        </span>
                                                    </div>

                                                    <div>
                                                        <p className='text-xs text-muted-foreground mb-1.5'>
                                                            Available Resources
                                                        </p>
                                                        {p.claims.length > 0 ? (
                                                            <div className='flex flex-wrap gap-1.5'>
                                                                {p.claims.map((claim) => {
                                                                    const resource = getLandboundRessourceByName(
                                                                        claim.name,
                                                                    );
                                                                    if (!resource) {
                                                                        console.warn(
                                                                            `Resource not found: ${claim.name}`,
                                                                        );
                                                                        return null;
                                                                    }
                                                                    return (
                                                                        <ProductQuantity
                                                                            key={claim.name}
                                                                            resource={resource}
                                                                            quantity={claim.freeCapacity}
                                                                            planetId={null}
                                                                            agentId={null}
                                                                            efficiency={1}
                                                                            isLimiting={false}
                                                                        />
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <div className='flex flex-wrap gap-1.5' aria-hidden>
                                                                <span className='opacity-0 select-none pointer-events-none text-xs border border-transparent px-2 py-0.5 rounded-md'>
                                                                    &nbsp;
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        </CarouselItem>
                                    );
                                })}
                            </CarouselContent>
                            <CarouselNav />
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
