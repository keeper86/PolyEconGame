import { useAgentId } from '@/hooks/useAgentId';
import { usePlanetId } from '@/hooks/usePlanetId';
import { AGENT_SUB_PAGES } from '@/lib/appRoutes';
import { useTRPC } from '@/lib/trpc';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '../ui/sidebar';
import { Building2 } from 'lucide-react';
import { CompanyLogo } from '../client/CompanyLogo';

export function CompanyNavEntry() {
    const { status } = useSession();
    const pathname = usePathname();
    const activePlanetId = usePlanetId();
    const { isMobile, setOpenMobile } = useSidebar();
    const trpc = useTRPC();

    const { agentId } = useAgentId();

    const loggedIn = status === 'authenticated';

    const { data: overviewData } = useSimulationQuery({
        ...trpc.simulation.getAgentOverview.queryOptions({ agentId: agentId ?? '' }),
        enabled: loggedIn && !!agentId,
    });

    const companyName = overviewData?.overview?.name ?? agentId ?? '';
    const companyLogo = overviewData?.overview?.logo ?? undefined;
    const companyHref =
        activePlanetId && agentId && loggedIn
            ? (`/planets/${encodeURIComponent(activePlanetId)}/agent/${encodeURIComponent(agentId)}` as never)
            : null;

    const handleClick = () => {
        if (isMobile) {
            setOpenMobile(false);
        }
    };

    const disabled = !activePlanetId || !agentId || !loggedIn;

    return (
        <SidebarMenuItem>
            <SidebarMenuButton
                asChild={!disabled && !!companyHref}
                size='default'
                className='text-md w-full'
                disabled={disabled}
                onClick={handleClick}
            >
                {!disabled && companyHref ? (
                    <Link href={companyHref}>
                        {companyLogo ? (
                            <CompanyLogo logoKey={companyLogo} size={24} />
                        ) : (
                            <Building2 width={24} height={24} />
                        )}
                        <span className='truncate'>{companyName}</span>
                    </Link>
                ) : (
                    <span className='flex items-center gap-2 truncate'>
                        {companyLogo ? (
                            <CompanyLogo logoKey={companyLogo} size={24} />
                        ) : (
                            <Building2 width={24} height={24} />
                        )}
                        <span className='truncate'>{companyName}</span>
                    </span>
                )}
            </SidebarMenuButton>
            <SidebarMenu className='pl-2 pt-1'>
                {AGENT_SUB_PAGES.map(({ segment, label, icon: Icon }) => {
                    const href =
                        activePlanetId && agentId && loggedIn
                            ? (`/planets/${encodeURIComponent(activePlanetId)}/agent/${encodeURIComponent(agentId)}/${segment}` as never)
                            : null;
                    const isActive = !!href && (pathname === href || pathname.startsWith(`${href}/`));
                    return (
                        <SidebarMenuItem key={segment}>
                            <SidebarMenuButton
                                asChild={!!href}
                                size='sm'
                                className='font-normal text-muted-foreground'
                                isActive={isActive}
                                disabled={!href}
                                onClick={handleClick}
                            >
                                {href ? (
                                    <Link href={href}>
                                        <Icon width={14} height={14} />
                                        {label}
                                    </Link>
                                ) : (
                                    <span className='flex items-center gap-2 text-muted-foreground'>
                                        <Icon width={14} height={14} />
                                        {label}
                                    </span>
                                )}
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    );
                })}
            </SidebarMenu>
        </SidebarMenuItem>
    );
}
