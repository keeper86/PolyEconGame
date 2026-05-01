import { usePlanetId } from '@/hooks/usePlanetId';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { Building2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '../ui/sidebar';

export type AgentSubPage = {
    segment: string;
    label: string;
    icon: LucideIcon;
};

const SUB_PAGES: AgentSubPage[] = [{ segment: 'agents', label: 'Companies', icon: Building2 }];

export function MiscNavEntry() {
    const { status } = useSession();
    const trpc = useTRPC();
    const pathname = usePathname();
    const activePlanetId = usePlanetId();
    const { isMobile, setOpenMobile } = useSidebar();

    const userQuery = useQuery(
        trpc.getUser.queryOptions({ userId: undefined }, { enabled: status === 'authenticated' }),
    );

    const agentId = userQuery.data?.agentId;

    if (status !== 'authenticated') {
        return null;
    }

    const handleClick = () => {
        if (isMobile) {
            setOpenMobile(false);
        }
    };

    return (
        <SidebarMenuItem>
            <SidebarMenu className='pl-2 pt-1'>
                {SUB_PAGES.map(({ segment, label, icon: Icon }) => {
                    const href =
                        activePlanetId && agentId
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
