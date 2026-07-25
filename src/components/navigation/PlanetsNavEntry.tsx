'use client';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { useAgentId } from '@/hooks/useAgentId';
import { replacePlanetInPath, usePlanetId } from '@/hooks/usePlanetId';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { Building2, ChevronDown, Globe, Landmark, Users } from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { GiAxeInStump } from 'react-icons/gi';
import { PlanetIcon } from '../client/PlanetIcon';

const PLANET_SUB_PAGES = [
    { segment: 'demographics', label: 'Demographics', icon: Users },
    { segment: 'central-bank', label: 'Central Bank', icon: Landmark },
    { segment: 'claims', label: 'Resources', icon: GiAxeInStump },
    { segment: 'companies', label: 'Companies', icon: Building2 },
] as const;

function ActivePlanetSubNav({ planetId, disabled }: { planetId: string | null; disabled: boolean }) {
    const pathname = usePathname();
    const { isMobile, setOpenMobile } = useSidebar();

    const handleClick = () => {
        if (isMobile) {
            setOpenMobile(false);
        }
    };

    return (
        <SidebarMenu className='pl-2 pt-1'>
            {PLANET_SUB_PAGES.map(({ segment, label, icon: Icon }) => {
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
                                <Link href={href as unknown as '/'}>
                                    <Icon width={14} height={14} />
                                    {label}
                                </Link>
                            ) : (
                                <span className='flex  gap-2'>
                                    <Icon width={14} height={14} />
                                    {label}
                                </span>
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
    const { agentId } = useAgentId();
    const hasCompany = loggedIn && !!agentId;

    const { data } = useSimulationQuery(trpc.simulation.getListOfPlanets.queryOptions());
    const planets = data?.planets ?? [];

    const activePlanet = planets.find((p) => p.planetId === activePlanetId);

    const handlePlanetSelect = (planetId: string) => {
        router.push(replacePlanetInPath(pathname, planetId) as unknown as '/');
        if (isMobile) {
            setOpenMobile(false);
        }
    };

    const subNavDisabled = !hasCompany || !activePlanetId;

    return (
        <SidebarMenuItem>
            <DropdownMenu open={open} onOpenChange={(next) => hasCompany && setOpen(next)}>
                <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                        size='default'
                        className='text-md w-full'
                        disabled={!hasCompany || !activePlanet}
                    >
                        {activePlanet ? (
                            <PlanetIcon planetId={activePlanet.planetId} />
                        ) : (
                            <Globe width={24} height={24} />
                        )}
                        <span>{activePlanet?.name ?? 'Planets'}</span>
                        {hasCompany && (
                            <ChevronDown
                                width={14}
                                height={14}
                                className='ml-auto transition-transform duration-200 data-[state=open]:rotate-180'
                                data-state={open ? 'open' : 'closed'}
                            />
                        )}
                    </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    {planets.length === 0 && <div className='px-2 py-1 text-xs text-muted-foreground'>Loading…</div>}
                    {planets.map((planet) => (
                        <DropdownMenuItem key={planet.planetId} onSelect={() => handlePlanetSelect(planet.planetId)}>
                            <PlanetIcon planetId={planet.planetId} size={24} />
                            <span>{planet.name}</span>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
            <ActivePlanetSubNav planetId={activePlanetId} disabled={subNavDisabled} />
        </SidebarMenuItem>
    );
}
