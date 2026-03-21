'use client';

import { useTRPC } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { AC_ID } from '@/simulation/utils/initialWorld';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
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

const NAV_TABS = [
    { segment: 'demographics', label: 'Demographics' },
    { segment: 'economy', label: 'Economy' },
    { segment: 'market', label: 'Market' },
] as const;

export default function PlanetDetailLayout({ children }: { children: ReactNode }) {
    const params = useParams();
    const pathname = usePathname();
    const planetId = (params?.planetId as string) ?? '';
    const trpc = useTRPC();

    // Only fetch the planet name (overview endpoint) so we have something for
    // the page title.  The sub-pages each fetch their own focused data.
    const { data } = useQuery(trpc.simulation.getPlanetOverview.queryOptions({ planetId }));

    const planetName = data?.overview?.name ?? planetId;
    const base = `/planets/${encodeURIComponent(planetId)}`;

    const watermarkSrc = PLANET_LARGE_IMAGES[planetId];
    console.log(planetId, watermarkSrc);

    return (
        <div className='planet-watermark-context relative isolate overflow-hidden min-h-[480px] sm:min-h-[600px] max-w-6xl mx-auto py-2 sm:px-4 sm:py-6 space-y-4 sm:space-y-6'>
            {watermarkSrc && (
                <Image
                    src={watermarkSrc}
                    alt=''
                    width={900}
                    height={900}
                    className='absolute top-0 right-0 -z-10 pointer-events-none select-none w-96 h-96 sm:w-[480px] sm:h-[480px] object-contain opacity-50'
                    unoptimized
                />
            )}
            {/* Header */}
            <div className='flex items-center justify-between'>
                <h1 className='text-3xl font-bold'>{planetName}</h1>
                <Link
                    href={'/planets' as never}
                    className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors'
                >
                    <ArrowLeft className='h-4 w-4' />
                    All planets
                </Link>
            </div>

            {/* Tab navigation */}
            <nav className='flex border-b border-border'>
                {NAV_TABS.map(({ segment, label }) => {
                    const href = `${base}/${segment}`;
                    const isActive = pathname === href || pathname.startsWith(`${href}/`);
                    return (
                        <Link
                            key={segment}
                            href={href as never}
                            prefetch
                            className={cn(
                                'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                                isActive
                                    ? 'border-primary text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                            )}
                        >
                            {label}
                        </Link>
                    );
                })}
            </nav>

            {/* Sub-page content */}
            {children}
        </div>
    );
}
