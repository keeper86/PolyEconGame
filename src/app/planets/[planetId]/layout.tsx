'use client';

import { useTRPC } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV_TABS = [
    { segment: 'overview', label: 'Overview' },
    { segment: 'demographics', label: 'Demographics' },
    { segment: 'economy', label: 'Economy' },
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

    return (
        <div className='max-w-6xl mx-auto py-2 sm:px-4 sm:py-6 space-y-4 sm:space-y-6'>
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
