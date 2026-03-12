"use client";
import { useIsSmallScreen } from '@/hooks/useMobile';
import { DynamicBreadcrumbs } from '@/components/navigation/dynamicBreadcrumbs';

export default function BreadcrumbsClientWrapper() {
    const isSmallScreen = useIsSmallScreen();
    if (isSmallScreen) { return null; }
    return <DynamicBreadcrumbs />;
}
