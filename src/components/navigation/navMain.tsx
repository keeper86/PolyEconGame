'use client';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import type { RouteMetadata } from '@/lib/appRoutes';
import { APP_ROUTES, isRoute, isRouteManifest } from '@/lib/appRoutes';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import type { ElementType, JSX } from 'react';
import React from 'react';
import { PlanetsNavEntry } from './PlanetsNavEntry';
import { CompanyNavEntry } from './CompanyNavEntry';
import { Separator } from '../ui/separator';

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
                <PlanetsNavEntry />
                <Separator className='my-4' />
                <CompanyNavEntry />
            </SidebarMenu>
        </nav>
    );
}
