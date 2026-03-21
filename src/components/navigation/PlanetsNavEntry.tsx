'use client';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { AC_ID } from '@/simulation/utils/initialWorld';
import { ChevronRight, Globe } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

const PLANET_ICONS: Record<string, string> = {
    earth: '/images/planets/earth.webp',
    gune: '/images/planets/gune.webp',
    icedonia: '/images/planets/icedonia.webp',
    pandara: '/images/planets/pandara.webp',
    paradies: '/images/planets/paradies.webp',
    suerte: '/images/planets/suerte.webp',
    [AC_ID]: '/images/planets/centauri.webp',
};

function PlanetIcon({ planetId }: { planetId: string }) {
    const src = PLANET_ICONS[planetId];
    if (!src) {
        return <Globe width={24} height={24} />;
    }
    return <Image src={src} alt={planetId} width={24} height={24} className='rounded-full object-cover' unoptimized />;
}

export function PlanetsNavEntry() {
    const [open, setOpen] = useState(false);
    const { isMobile, setOpenMobile } = useSidebar();
    const trpc = useTRPC();

    const { data } = useSimulationQuery(trpc.simulation.getLatestPlanetSummaries.queryOptions());
    const planets = data?.planets ?? [];

    const handleClick = () => {
        if (isMobile) {
            setOpenMobile(false);
        }
    };

    return (
        <SidebarMenuItem>
            <Collapsible open={open} onOpenChange={setOpen}>
                <CollapsibleTrigger asChild>
                    <SidebarMenuButton size='default' className='text-md w-full'>
                        <Globe width={16} height={16} />
                        <span>Planets</span>
                        <ChevronRight
                            width={14}
                            height={14}
                            className='ml-auto transition-transform duration-200 data-[state=open]:rotate-90'
                            data-state={open ? 'open' : 'closed'}
                        />
                    </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <SidebarMenu className='pl-2 pt-1'>
                        {planets.map((planet) => (
                            <SidebarMenuItem key={planet.planetId}>
                                <SidebarMenuButton
                                    asChild
                                    size='sm'
                                    className='font-normal text-muted-foreground'
                                    onClick={handleClick}
                                >
                                    <Link href={`/planets/${encodeURIComponent(planet.planetId)}` as unknown as '/'}>
                                        <PlanetIcon planetId={planet.planetId} />
                                        <span>{planet.name}</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        ))}
                        {planets.length === 0 && (
                            <SidebarMenuItem>
                                <span className='px-2 py-1 text-xs text-muted-foreground'>Loading…</span>
                            </SidebarMenuItem>
                        )}
                    </SidebarMenu>
                </CollapsibleContent>
            </Collapsible>
        </SidebarMenuItem>
    );
}
