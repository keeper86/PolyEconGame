'use client';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { replacePlanetInPath, usePlanetId } from '@/hooks/usePlanetId';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { AGENT_SUB_PAGES } from '@/lib/appRoutes';
import { useTRPC } from '@/lib/trpc';
import { ChevronRight, Globe } from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { PlanetIcon } from '../client/PlanetIcon';

const PLANET_SUB_PAGES = [
    { segment: 'demographics', label: 'Demographics' },
    { segment: 'economy', label: 'Economy' },
    { segment: 'market', label: 'Market' },
] as const;

const AGENT_ROUTE_PATTERN = /^\/planets\/([^/]+)\/agent\/([^/]+)/;

function ActivePlanetSubNav({ planetId, disabled }: { planetId: string | null; disabled: boolean }) {
    const pathname = usePathname();
    const { isMobile, setOpenMobile } = useSidebar();

    const agentMatch = AGENT_ROUTE_PATTERN.exec(pathname);
    const agentId = agentMatch?.[2] ?? null;

    const handleClick = () => {
        if (isMobile) {
            setOpenMobile(false);
        }
    };

    if (agentId && planetId) {
        return (
            <SidebarMenu className='pl-2 pt-1'>
                {AGENT_SUB_PAGES.map(({ segment, label, icon: Icon }) => {
                    const href = `/planets/${encodeURIComponent(planetId)}/agent/${encodeURIComponent(agentId)}/${segment}`;
                    const isActive = pathname === href || pathname.startsWith(`${href}/`);
                    return (
                        <SidebarMenuItem key={segment}>
                            <SidebarMenuButton
                                asChild
                                size='sm'
                                className='font-normal text-muted-foreground'
                                isActive={isActive}
                                onClick={handleClick}
                            >
                                <Link href={href as unknown as '/'}>
                                    <Icon width={14} height={14} />
                                    {label}
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    );
                })}
            </SidebarMenu>
        );
    }

    return (
        <SidebarMenu className='pl-2 pt-1'>
            {PLANET_SUB_PAGES.map(({ segment, label }) => {
                const href = planetId ? `/planets/${encodeURIComponent(planetId)}/${segment}` : null;
                const isActive = !!href && (pathname === href || pathname.startsWith(`${href}/`));
                return (
                    <SidebarMenuItem key={segment}>
                        <SidebarMenuButton
                            asChild={!disabled && !!href}
                            size='sm'
                            className='font-normal text-muted-foreground'
                            isActive={isActive}
                            disabled={disabled || !href}
                            onClick={handleClick}
                        >
                            {!disabled && href ? (
                                <Link href={href as unknown as '/'}>{label}</Link>
                            ) : (
                                <span>{label}</span>
                            )}
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                );
            })}
        </SidebarMenu>
    );
}

export function PlanetsNavEntry() {
    const [open, setOpen] = useState(false);
    const { isMobile, setOpenMobile } = useSidebar();
    const trpc = useTRPC();
    const router = useRouter();
    const pathname = usePathname();
    const activePlanetId = usePlanetId();
    const loggedIn = useSession().status === 'authenticated';

    const { data } = useSimulationQuery(trpc.simulation.getLatestPlanetSummaries.queryOptions());
    const planets = data?.planets ?? [];

    const activePlanet = planets.find((p) => p.planetId === activePlanetId);

    const handlePlanetSelect = (planetId: string) => {
        router.push(replacePlanetInPath(pathname, planetId) as unknown as '/');
        setOpen(false);
        if (isMobile) {
            setOpenMobile(false);
        }
    };

    const subNavDisabled = !loggedIn || !activePlanetId;

    return (
        <SidebarMenuItem>
            <Collapsible open={open} onOpenChange={(next) => loggedIn && setOpen(next)}>
                <CollapsibleTrigger asChild>
                    <SidebarMenuButton size='default' className='text-md w-full' disabled={!loggedIn}>
                        {activePlanet ? (
                            <PlanetIcon planetId={activePlanet.planetId} />
                        ) : (
                            <Globe width={24} height={24} />
                        )}
                        <span>{activePlanet?.name ?? 'Planets'}</span>
                        {loggedIn && (
                            <ChevronRight
                                width={14}
                                height={14}
                                className='ml-auto transition-transform duration-200 data-[state=open]:rotate-90'
                                data-state={open ? 'open' : 'closed'}
                            />
                        )}
                    </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <SidebarMenu className='pl-2 pt-1'>
                        {planets.length === 0 && (
                            <SidebarMenuItem>
                                <span className='px-2 py-1 text-xs text-muted-foreground'>Loading…</span>
                            </SidebarMenuItem>
                        )}
                        {planets.map((planet) => (
                            <SidebarMenuItem key={planet.planetId}>
                                <SidebarMenuButton
                                    size='sm'
                                    className='font-normal text-muted-foreground'
                                    isActive={planet.planetId === activePlanetId}
                                    onClick={() => handlePlanetSelect(planet.planetId)}
                                >
                                    <PlanetIcon planetId={planet.planetId} size={24} />
                                    <span>{planet.name}</span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                </CollapsibleContent>
            </Collapsible>
            <ActivePlanetSubNav planetId={activePlanetId} disabled={subNavDisabled} />
        </SidebarMenuItem>
    );
}
