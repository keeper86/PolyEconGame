'use client';

import { Carousel, CarouselContent, CarouselItem, useCarousel } from '@/components/ui/carousel';
import { useTRPC } from '@/lib/trpc';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { formatNumberWithUnit } from '@/lib/utils';
import { PLANET_LARGE_IMAGES } from '@/lib/planetAssets';
import { getLandboundRessourceByName } from '@/simulation/planet/landBoundResources';
import { ProductQuantity } from '@/components/client/ProductQuantity';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function CarouselNav() {
    const { scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel();

    return (
        <div className='absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between p-3 sm:p-5 pointer-events-none rounded-b-xl'>
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

export default function PlanetsPage() {
    const trpc = useTRPC();

    const { isLoading, data } = useSimulationQuery(trpc.simulation.getLatestPlanetSummaries.queryOptions());

    const planetSummaries = data?.planets ?? [];

    return (
        <div className='container py-6 space-y-6'>
            <div>
                <h1 className='text-2xl font-bold tracking-tight'>Planets</h1>
                <p className='text-sm text-muted-foreground mt-1'>
                    Explore the celestial bodies of the PolyEcon universe
                </p>
            </div>

            {isLoading || planetSummaries.length === 0 ? (
                <div className='text-sm text-muted-foreground'>Waiting for simulation data…</div>
            ) : (
                <div className='max-w-lg mx-auto'>
                    <Carousel>
                        <CarouselContent>
                            {planetSummaries.map((p) => {
                                const watermarkSrc = PLANET_LARGE_IMAGES[p.planetId];

                                const minWage = Math.min(p.wageEdu0, p.wageEdu1, p.wageEdu2, p.wageEdu3);
                                const maxWage = Math.max(p.wageEdu0, p.wageEdu1, p.wageEdu2, p.wageEdu3);

                                return (
                                    <CarouselItem key={p.planetId} className='basis-full'>
                                        <Link
                                            href={`/planets/${encodeURIComponent(p.planetId)}` as never}
                                            className='relative isolate overflow-hidden rounded-xl border border-border hover:border-muted-foreground/50 text-left w-full block transition-colors'
                                        >
                                            {watermarkSrc && (
                                                <Image
                                                    src={watermarkSrc}
                                                    alt=''
                                                    width={720}
                                                    height={720}
                                                    className='absolute -top-8 -right-8 -z-10 pointer-events-none select-none w-86 h-86 object-contain opacity-40'
                                                    priority
                                                    unoptimized
                                                    aria-hidden='true'
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
                                                        {formatNumberWithUnit(p.moneySupply, 'currency', p.planetId)}
                                                    </span>

                                                    <span className='text-muted-foreground'>Bank Equity</span>
                                                    <span className='text-right font-medium'>
                                                        {formatNumberWithUnit(p.bank.equity, 'currency', p.planetId)}
                                                    </span>

                                                    <span className='text-muted-foreground'>Interest Rate</span>
                                                    <span className='text-right font-medium tabular-nums'>
                                                        {(p.policyRate * 100).toFixed(2)} %
                                                    </span>

                                                    <span className='text-muted-foreground'>Cost of Living</span>
                                                    <span className='text-right font-medium'>
                                                        {formatNumberWithUnit(p.costOfLiving, 'currency', p.planetId)}
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
                                                                    console.warn(`Resource not found: ${claim.name}`);
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
                                                        <div className='flex flex-wrap gap-1.5' aria-hidden='true'>
                                                            <span className='opacity-0 select-none pointer-events-none text-xs border border-transparent px-2 py-0.5 rounded-md'>
                                                                &nbsp;
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </Link>
                                    </CarouselItem>
                                );
                            })}
                        </CarouselContent>
                        <CarouselNav />
                    </Carousel>
                </div>
            )}
        </div>
    );
}
