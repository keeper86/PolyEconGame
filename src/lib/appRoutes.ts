import {
    type LucideIcon,
    Building2,
    EuroIcon,
    FileText,
    FlaskConical,
    Gamepad,
    Home,
    Landmark,
    Mail,
    Network,
    Package,
    ShoppingCartIcon,
    User,
    Users,
    Warehouse,
} from 'lucide-react';
import { GiAxeInStump } from 'react-icons/gi';
import { GoRocket } from 'react-icons/go';

import type { Route } from 'nextjs-routes';
import type { IconType } from 'react-icons';
import type en from '../../messages/en.json';

export type NavLabel = keyof typeof en.Nav;

export type RouteMetadata = {
    path: Exclude<Route['pathname'], `/api/${string}`>;
    label: NavLabel;
    icon?: LucideIcon | IconType;
    isPublic?: boolean;
    description?: string;
    isMainNav?: boolean;
    isSecondaryNav?: boolean;
};

export const isRoute = (entry: unknown): entry is RouteMetadata => {
    return typeof entry === 'object' && entry !== null && 'path' in entry && 'label' in entry && !('root' in entry);
};

export const isRouteManifest = (entry: unknown): entry is RouteManifest => {
    return typeof entry === 'object' && entry !== null && 'root' in entry && isRoute(entry.root);
};

export interface RouteManifest {
    root: RouteMetadata;
    [key: string]: RouteMetadata | RouteManifest;
}

export type RouteManifestEntry = RouteMetadata | RouteManifest;

export const APP_ROUTES = {
    root: {
        path: '/',
        label: 'Enterprise Engine',
        icon: Home,
        isPublic: true,
        description: 'Dashboard and overview',
    },
    pong: {
        path: '/pong',
        label: 'Paddle War',
        icon: Gamepad,
        isPublic: true,
        description: 'Classic pong game',
    },
    account: {
        root: {
            path: '/account',
            label: 'Account',
            icon: User,
            description: 'User account settings',
        },
    },
    messages: {
        path: '/messages',
        label: 'Messages',
        icon: Mail,
        isSecondaryNav: true,
        description: 'Direct messages from other players',
    },
    imprint: {
        path: '/imprint',
        label: 'Imprint',
        icon: FileText,
        isPublic: true,
        isSecondaryNav: true,
        description: 'Legal information and imprint',
    },
    simulation: {
        path: '/simulation',
        label: 'Simulation Model',
        icon: FlaskConical,
        isPublic: true,
        isSecondaryNav: true,
        description: 'Scientific description of the simulation model with mathematical formulations',
    },
    supplyChain: {
        path: '/supply-chain',
        label: 'Supply Chain Simulator',
        icon: Network,
        isSecondaryNav: true,
        description: 'Interactive supply chain balance calculator and dependency visualiser',
    },
} as const satisfies RouteManifest;

const filterRoutes = (route: RouteManifestEntry, condition: (route: RouteMetadata) => boolean) => {
    const filteredRoutes: RouteMetadata[] = [];
    if (isRoute(route)) {
        if (condition(route)) {
            filteredRoutes.push(route);
        }
    } else {
        Object.values(route).forEach((child) => filteredRoutes.push(...filterRoutes(child, condition)));
    }
    return filteredRoutes;
};

let mainNavRoutes: RouteMetadata[] = [];
export function getMainNavRoutes(): RouteMetadata[] {
    if (mainNavRoutes.length > 0) {
        return mainNavRoutes;
    }
    mainNavRoutes = filterRoutes(APP_ROUTES, (route) => route.isMainNav === true);
    return mainNavRoutes;
}

let publicRoutes: string[] = [];
export const getPublicRoutes = () => {
    if (publicRoutes.length > 0) {
        return publicRoutes;
    }
    publicRoutes = filterRoutes(APP_ROUTES, (route) => route.isPublic === true).map((route) => route.path);
    return publicRoutes;
};

let protectedRoutes: RouteMetadata[] = [];
export function getProtectedRoutes(): RouteMetadata[] {
    if (protectedRoutes.length > 0) {
        return protectedRoutes;
    }
    protectedRoutes = filterRoutes(APP_ROUTES, (route) => route.isPublic !== true);
    return protectedRoutes;
}

let secondaryNavRoutes: RouteMetadata[] = [];
export function getSecondaryNavRoutes(): RouteMetadata[] {
    if (secondaryNavRoutes.length > 0) {
        return secondaryNavRoutes;
    }
    secondaryNavRoutes = filterRoutes(APP_ROUTES, (route) => route.isSecondaryNav === true);
    return secondaryNavRoutes;
}

export type AgentSubPage = {
    segment: string;
    label: NavLabel;
    icon: LucideIcon | IconType;
};

export const AGENT_SUB_PAGES: AgentSubPage[] = [
    { segment: 'financial', label: 'Finances', icon: EuroIcon },
    { segment: 'workforce', label: 'Workforce', icon: Users },
    { segment: 'production', label: 'Production', icon: Package },
    { segment: 'storage', label: 'Storage', icon: Warehouse },
    { segment: 'market', label: 'Market', icon: ShoppingCartIcon },
    { segment: 'ships', label: 'Ships', icon: GoRocket },
];

export const PLANET_SUB_PAGES: AgentSubPage[] = [
    { segment: 'demographics', label: 'Demographics', icon: Users },
    { segment: 'central-bank', label: 'Central Bank', icon: Landmark },
    { segment: 'claims', label: 'Resources', icon: GiAxeInStump },
    { segment: 'companies', label: 'Companies', icon: Building2 },
];
