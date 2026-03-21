'use client';

import { useTRPC } from '@/lib/trpc';
import { AC_ID } from '@/simulation/utils/initialWorld';
import { useQuery } from '@tanstack/react-query';
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

    const { data } = useQuery(trpc.simulation.getPlanetOverview.queryOptions({ planetId }));

    const planetName = data?.overview?.name ?? planetId;
    const watermarkSrc = PLANET_LARGE_IMAGES[planetId];

    return (
        <div className='planet-watermark-context relative isolate overflow-hidden min-h-[900px] sm:min-h-[900px] max-w-6xl mx-auto py-2 sm:px-4 sm:py-6 space-y-4 sm:space-y-6'>
            {watermarkSrc && (
                <Image
                    src={watermarkSrc}
                    alt=''
                    width={900}
                    height={900}
                    className='absolute top-0 right-0 -z-10 pointer-events-none select-none w-96 h-96 sm:w-[900px] sm:h-[900px] object-contain opacity-50'
                    unoptimized
                    fetchPriority='high'
                    priority
                />
            )}
            <h1 className='text-3xl font-bold'>{planetName}</h1>
            {children}
        </div>
    );
}
