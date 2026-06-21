'use client';

import { PLANET_LARGE_IMAGES } from '@/lib/planetAssets';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';

export default function PlanetDetailLayout({ children }: { children: ReactNode }) {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';

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
            {children}
        </div>
    );
}
