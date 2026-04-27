'use client';

import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { AC_ID } from '@/simulation/utils/initialWorld';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';

const PLANET_LARGE_IMAGES: Record<string, string> = {
    earth: '/images/planets/earth_large.webp',
    gune: '/images/planets/gune_large.webp',
    icedonia: '/images/planets/icedonia_large.webp',
    pandara: '/images/planets/pandara_large.webp',
    paradies: '/images/planets/paradies_large.webp',
    suerte: '/images/planets/suerte_large.webp',
    [AC_ID]: '/images/planets/centauri_large.webp',
};

export default function PlanetDetailLayout({ children }: { children: ReactNode }) {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const trpc = useTRPC();

    const { data } = useSimulationQuery(trpc.simulation.getPlanetOverview.queryOptions({ planetId }));

    const planetName = data?.name ?? planetId;
    const populationTotal = data?.populationTotal;
    const watermarkSrc = PLANET_LARGE_IMAGES[planetId];

    return (
        <div className='planet-watermark-context relative isolate overflow-hidden min-h-[900px] max-w-6xl mx-auto py-2 sm:px-4 sm:py-6 space-y-4 sm:space-y-6'>
            {watermarkSrc && (
                <Image
                    src={watermarkSrc}
                    alt=''
                    width={900}
                    height={900}
                    className='absolute top-0 right-0 -z-10 pointer-events-none select-none w-96 h-96 sm:w-128 sm:h-128 md:w-[600px] md:h-[600px] lg:w-[900px] lg:h-[900px] object-contain opacity-50'
                    unoptimized
                    fetchPriority='high'
                    priority
                />
            )}
            <span className='flex justify-between mb-2'>
                <h1 className='text-3xl font-bold'>{planetName}</h1>
                {populationTotal !== undefined && (
                    <span className='text-sm text-muted-foreground self-end'>{`Total population: ${formatNumberWithUnit(populationTotal, 'persons')}`}</span>
                )}
            </span>
            {children}
        </div>
    );
}
