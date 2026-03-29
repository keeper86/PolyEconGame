import { usePlanetId } from '@/hooks/usePlanetId';
import { AGENT_SUB_PAGES } from '@/lib/appRoutes';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '../ui/sidebar';
import { JoinGameDialog } from './JoinGameDialog';

export function CompanyNavEntry() {
    const { status } = useSession();
    const trpc = useTRPC();
    const pathname = usePathname();
    const activePlanetId = usePlanetId();
    const { isMobile, setOpenMobile } = useSidebar();

    const userQuery = useQuery(
        trpc.getUser.queryOptions({ userId: undefined }, { enabled: status === 'authenticated' }),
    );

    const agentId = userQuery.data?.agentId;

    const agentQuery = useQuery(
        trpc.simulation.getAgentDetail.queryOptions(
            { agentId: agentId ?? '' },
            {
                enabled: status === 'authenticated' && !!agentId,
            },
        ),
    );

    if (status !== 'authenticated') {
        return null;
    }

    if (!agentId) {
        return (
            <SidebarMenuItem>
                <JoinGameDialog />
            </SidebarMenuItem>
        );
    }

    const agent = agentQuery.data?.agent;
    const companyName = agent?.name ?? 'My Company';

    const handleClick = () => {
        if (isMobile) {
            setOpenMobile(false);
        }
    };

    return (
        <SidebarMenuItem>
            <SidebarMenu className='pl-2 pt-1'>
                {AGENT_SUB_PAGES.map(({ segment, label, icon: Icon }) => {
                    const href = activePlanetId
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
                                    <Link href={href} aria-disabled={!href}>
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
