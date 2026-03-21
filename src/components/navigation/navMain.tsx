'use client';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import type { RouteMetadata } from '@/lib/appRoutes';
import { APP_ROUTES, isRoute, isRouteManifest } from '@/lib/appRoutes';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import React from 'react';
import type { ElementType, JSX } from 'react';
import { JoinGameDialog } from './JoinGameDialog';
import { PlanetsNavEntry } from './PlanetsNavEntry';

function RenderNavEntry(route: RouteMetadata, opts?: { isSub?: boolean }): JSX.Element {
    const { isSub } = opts || {};
    const { isMobile, setOpenMobile } = useSidebar();
    const loggedIn = useSession().status === 'authenticated';

    const handleClick = () => {
        if (isMobile) {
            setOpenMobile(false);
        }
    };

    const showRoute = (route: RouteMetadata): boolean => route.isPublic === true || loggedIn;

    return (
        <SidebarMenuItem key={route.path}>
            <SidebarMenuButton
                asChild
                size={isSub ? 'sm' : 'default'}
                className={isSub ? 'font-normal text-muted-foreground' : 'text-md'}
                onClick={handleClick}
            >
                <Link href={route.path as unknown as '/'} aria-disabled={!showRoute(route)}>
                    {route.icon && !isSub
                        ? React.createElement(route.icon as ElementType, { width: 16, height: 16 })
                        : null}
                    <span>{route.label}</span>
                </Link>
            </SidebarMenuButton>
        </SidebarMenuItem>
    );
}

function CompanyNavEntry() {
    const { status } = useSession();
    const trpc = useTRPC();
    const { isMobile, setOpenMobile } = useSidebar();

    const userQuery = useQuery(
        trpc.getUser.queryOptions({ userId: undefined }, { enabled: status === 'authenticated' }),
    );

    const agentQuery = useQuery(
        trpc.simulation.getAgentListSummaries.queryOptions(undefined, {
            enabled: status === 'authenticated' && !!userQuery.data?.agentId,
        }),
    );

    if (status !== 'authenticated') {
        return null;
    }

    const agentId = userQuery.data?.agentId;

    if (!agentId) {
        return (
            <SidebarMenuItem>
                <div className='px-2 py-1'>
                    <JoinGameDialog />
                </div>
            </SidebarMenuItem>
        );
    }

    const agent = agentQuery.data?.agents.find((a) => a.agentId === agentId);
    const companyName = agent?.name ?? 'My Company';

    const handleClick = () => {
        if (isMobile) {
            setOpenMobile(false);
        }
    };

    return (
        <SidebarMenuItem>
            <SidebarMenuButton asChild size='default' className='text-md' onClick={handleClick}>
                <Link href={`/agents/${agentId}` as unknown as '/'}>
                    <Building2 width={16} height={16} />
                    <span>{companyName}</span>
                </Link>
            </SidebarMenuButton>
        </SidebarMenuItem>
    );
}

export function NavMain() {
    return (
        <nav className='py-4 px-4'>
            <SidebarMenu>
                {Object.values(APP_ROUTES).map((route) => {
                    if (isRoute(route)) {
                        if (route.isMainNav === true) {
                            return RenderNavEntry(route);
                        }
                        return null;
                    }
                    if (isRouteManifest(route)) {
                        const { root, ...rest } = route;
                        if (!isRoute(root) || root.isMainNav !== true) {
                            return null;
                        }
                        const subItems: JSX.Element[] = [];
                        Object.values(rest).forEach((subRoute) => {
                            if (isRoute(subRoute)) {
                                subItems.push(RenderNavEntry(subRoute, { isSub: true }));
                            }
                        });
                        return (
                            <React.Fragment key={root.path + '.block'}>
                                {RenderNavEntry(root)}
                                {subItems.length > 0 && <ul>{subItems}</ul>}
                            </React.Fragment>
                        );
                    }
                    return null;
                })}
                <CompanyNavEntry />
                <PlanetsNavEntry />
            </SidebarMenu>
        </nav>
    );
}
