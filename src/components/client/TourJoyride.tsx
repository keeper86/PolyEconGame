'use client';

import { useTour } from '@/components/client/TourContext';
import { getStepsForPage, type PageRoute } from '@/lib/tourSteps';
import { useAgentId } from '@/hooks/useAgentId';
import dynamic from 'next/dynamic';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EventHandler, Props } from 'react-joyride';

/**
 * We need to dynamically import Joyride because it's a heavy client-only library
 * that uses DOM APIs. The dynamic import with `ssr: false` prevents SSR issues.
 */
const Joyride = dynamic(() => import('react-joyride').then((mod) => mod.Joyride), {
    ssr: false,
}) as React.ComponentType<Props>;

function pathToPageRoute(pathname: string): PageRoute | null {
    if (pathname.includes('/central-bank')) {
        return 'central-bank';
    }
    if (pathname.includes('/financial')) {
        return 'financial';
    }
    if (pathname.includes('/workforce')) {
        return 'workforce';
    }
    if (pathname.includes('/claims')) {
        return 'claims';
    }
    if (pathname.includes('/production')) {
        return 'production';
    }
    if (pathname.includes('/storage')) {
        return 'storage';
    }
    if (pathname.includes('/market')) {
        return 'market';
    }
    if (pathname.includes('/ships')) {
        return 'ships';
    }
    return null;
}

export function TourJoyride() {
    const pathname = usePathname();
    const params = useParams();
    const router = useRouter();
    const { isTourActive, currentPageIndex, completeTour, setCurrentPageIndex } = useTour();
    const { agentId: resolvedAgentId } = useAgentId() as { agentId: string | null };

    const [mounted, setMounted] = useState(false);
    // When navigating between tour pages, we must immediately stop rendering
    // joyride to remove its overlay, then navigate. Otherwise joyride's overlay
    // blocks the page after clicking a navigation step.
    const [navigating, setNavigating] = useState(false);
    // Wait for all data-tour target elements to be present in the DOM before
    // rendering Joyride. This prevents the overlay from blocking the page while
    // async data (useSimulationQuery) is still loading.
    const [targetsReady, setTargetsReady] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const currentPageRoute = useMemo(() => pathToPageRoute(pathname), [pathname]);

    // Extract planetId from URL params (always present on tour pages)
    const planetId = (params?.planetId as string) ?? '';

    // Resolve agentId: prefer URL param (for agent pages), fall back to hook result
    const agentId = (params?.agentId as string) || (resolvedAgentId ?? '');

    // Stable router push callback for step `after` navigation
    const routerPush = useCallback(
        (url: string) => {
            router.push(url as unknown as '/');
        },
        [router],
    );

    // Compute steps (available even before rendering Joyride, for target checking)
    const steps = useMemo(() => {
        if (!currentPageRoute || !planetId) {
            return [];
        }
        return getStepsForPage(currentPageRoute, planetId, agentId, routerPush);
    }, [currentPageRoute, planetId, agentId, routerPush]);

    // Extract unique non-body target selectors from the current page's steps
    const targetSelectors = useMemo(() => {
        const selectors = new Set<string>();
        for (const step of steps) {
            if (step.target && step.target !== 'body' && typeof step.target === 'string') {
                selectors.add(step.target);
            }
        }
        return Array.from(selectors);
    }, [steps]);

    // ── Navigating reset ─────────────────────────────────────────────
    // When the page route changes (inter-page navigation completed),
    // reset navigating and targetsReady so the tour re-appears.
    const prevPageRouteRef = useRef(currentPageRoute);
    useEffect(() => {
        if (prevPageRouteRef.current !== currentPageRoute) {
            prevPageRouteRef.current = currentPageRoute;
            setNavigating(false);
            setTargetsReady(false);
        }
    }, [currentPageRoute]);

    // ── MutationObserver for target readiness ─────────────────────────
    // Waits for all data-tour target selectors to be present in the DOM
    // before allowing Joyride to render.
    useEffect(() => {
        // If tour not active or no steps, no need to wait
        if (!isTourActive || steps.length === 0) {
            setTargetsReady(true);
            return;
        }

        // Body-only steps (navigation steps) have no real targets to wait for
        if (targetSelectors.length === 0) {
            setTargetsReady(true);
            return;
        }

        // Quick check — maybe everything is already in the DOM
        const allExist = targetSelectors.every((sel) => document.querySelector(sel));
        if (allExist) {
            setTargetsReady(true);
            return;
        }

        // Observe DOM for target elements to appear
        const observer = new MutationObserver(() => {
            const ready = targetSelectors.every((sel) => document.querySelector(sel));
            if (ready) {
                observer.disconnect();
                setTargetsReady(true);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Safety timeout: show tour after 10s even if targets are missing
        const timeout = setTimeout(() => {
            observer.disconnect();
            setTargetsReady(true);
        }, 10_000);

        return () => {
            observer.disconnect();
            clearTimeout(timeout);
        };
    }, [isTourActive, steps, targetSelectors]);

    // If the tour is not active, not mounted yet, or we're not on a tour page, render nothing.
    // Also hide joyride during inter-page navigation or while waiting for DOM targets.
    if (!mounted || !isTourActive || !currentPageRoute || !planetId || navigating || !targetsReady) {
        return null;
    }

    if (steps.length === 0) {
        return null;
    }

    const handleOnEvent: EventHandler = (data) => {
        const { action, index, status, type } = data;
        const currentStep = steps[index];
        const stepWithAfter = currentStep as (typeof steps)[number] & { after?: () => void };
        const isNavStep = currentStep?.target === 'body' && typeof stepWithAfter.after === 'function';

        // Navigation steps: before navigating, stop rendering joyride entirely
        // so its overlay is removed. The component will re-mount on the next page.
        if (type === 'step:after' && isNavStep && (action === 'next' || status === 'finished')) {
            setNavigating(true);
            setCurrentPageIndex(0);
            // Schedule navigation after React removes joyride from the DOM
            setTimeout(() => {
                stepWithAfter.after?.();
            }, 0);
            return;
        }

        // Regular content step — just advance the index
        if (type === 'step:after' && action === 'next') {
            setCurrentPageIndex(index + 1);
        }

        // Handle tour skip/close or genuine completion (ships final step)
        if ((status === 'finished' && !isNavStep) || status === 'skipped' || action === 'close') {
            completeTour();
        }
    };

    return (
        <Joyride
            steps={steps}
            run={isTourActive}
            continuous
            stepIndex={currentPageIndex}
            onEvent={handleOnEvent}
            options={{
                showProgress: true,
                spotlightPadding: 8,
                primaryColor: '#22c55e',
            }}
            styles={{
                tooltip: {
                    borderRadius: '12px',
                    padding: '20px',
                    fontSize: '14px',
                } as React.CSSProperties,
                tooltipContainer: {
                    padding: '10px 0',
                    lineHeight: '1.6',
                } as React.CSSProperties,
                buttonPrimary: {
                    backgroundColor: '#22c55e',
                    borderRadius: '8px',
                    padding: '8px 20px',
                    fontSize: '14px',
                    fontWeight: 600,
                } as React.CSSProperties,
                buttonBack: {
                    color: '#64748b',
                    fontSize: '14px',
                } as React.CSSProperties,
                buttonSkip: {
                    color: '#94a3b8',
                    fontSize: '13px',
                } as React.CSSProperties,
                buttonClose: {
                    color: '#94a3b8',
                } as React.CSSProperties,
            }}
            locale={{
                back: 'Back',
                close: 'Close',
                last: 'Finish',
                next: 'Next',
                skip: 'Skip tour',
            }}
        />
    );
}
