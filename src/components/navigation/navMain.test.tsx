import AppProviders from '@/app/AppProviders';
import { getMainNavRoutes, getProtectedRoutes, getPublicRoutes } from '@/lib/appRoutes';
import { screen } from '@testing-library/react';
import type { Session } from 'next-auth';
import React from 'react';
import { renderWithIntl } from 'tests/vitest/renderWithIntl';
import { describe, expect, it } from 'vitest';
import { NavMain } from './navMain';
import { SidebarProvider } from '../ui/sidebar';
import { NavSecondary } from './navSecondary';

const MOCK_SESSION: Session = {
    type: 'next-auth',
    accessToken: 'mock-access-token',
    user: { id: 'test-user', name: 'Test User', email: 'test@example.com', agentId: null, planetId: null },
    expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
};

describe('NavMain', () => {
    it('renders all main navigation routes from APP_ROUTES and their icons', () => {
        renderWithIntl(
            <AppProviders session={MOCK_SESSION}>
                <SidebarProvider>
                    <NavMain />
                </SidebarProvider>
            </AppProviders>,
        );
        const mainNavRoutes = getMainNavRoutes();
        for (const route of mainNavRoutes) {
            expect(screen.getByText(route.label)).toBeInTheDocument();
            const link = screen.getByText(route.label).closest('a');
            expect(link).toHaveAttribute('href', route.path);
            if (route.icon) {
                const svg = link?.querySelector('svg');
                expect(svg).toBeTruthy();
            }
        }
    });

    it('translates navigation labels into the active locale', () => {
        renderWithIntl(
            <AppProviders session={MOCK_SESSION}>
                <SidebarProvider>
                    <NavMain />
                    <NavSecondary />
                </SidebarProvider>
            </AppProviders>,
            { locale: 'de' },
        );

        expect(screen.getByText('Simulationsmodell')).toBeInTheDocument();
        expect(screen.getByText('Lieferketten-Simulator')).toBeInTheDocument();
    });

    it('shows only public routes when not logged in', () => {
        renderWithIntl(
            <AppProviders session={null}>
                <SidebarProvider>
                    <NavMain />
                    <NavSecondary />
                </SidebarProvider>
            </AppProviders>,
        );

        const publicRoutes = getPublicRoutes();
        const mainRoutes = getMainNavRoutes();

        for (const path of publicRoutes) {
            const routeMeta = mainRoutes.find((r) => r.path === path) || null;
            if (routeMeta) {
                expect(screen.getByText(routeMeta.label)).toBeInTheDocument();
            }
        }

        const protectedRoutes = getProtectedRoutes();
        for (const route of protectedRoutes) {
            if (!route.isPublic) {
                const maybe = screen.queryByRole('link', { name: route.label });
                if (maybe) {
                    expect(maybe).toHaveAttribute('aria-disabled', 'true');
                }
            }
        }
    });
});
