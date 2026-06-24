'use client';

import { useTour } from '@/components/tour/TourContext';
import { getStepsForPage, type PageRoute } from '@/components/tour/tourSteps';
import { useAgentId } from '@/hooks/useAgentId';
import { useNavigationGuard } from '@/hooks/useNavigationGuard';
import { TourTooltip } from '@/components/tour/TourTooltip';
import dynamic from 'next/dynamic';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EventHandler, Props, Step } from 'react-joyride';

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
    const { isTourActive, currentPageIndex, completeTour, setCurrentPageIndex, completedActions } = useTour();
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

    // Navigation callbacks extracted from step `after()` hooks.
    // IMPORTANT: We mutate this Map in-place (clear + set) rather than replacing it
    // with a new object, because the timeout in handleOnEvent captures the ref's
    // current value at scheduling time and needs the SAME Map object to still be
    // alive when the timeout fires.
    const navCallbacksRef = useRef<Map<number, () => void>>(new Map());

    // Compute steps (available even before rendering Joyride, for target checking).
    // All `after` callbacks are stripped from the steps passed to Joyride.
    // Instead, they are stored in navCallbacksRef and called manually from
    // handleOnEvent on forward navigation only.
    const steps = useMemo(() => {
        // Clear existing entries but keep the SAME Map object so any closures
        // that already hold a reference to navCallbacksRef.current still work.
        navCallbacksRef.current.clear();
        if (!currentPageRoute || !planetId) {
            return [];
        }
        const allSteps = getStepsForPage(currentPageRoute, planetId, agentId, routerPush, completedActions);
        return allSteps.map((step: Step, i: number) => {
            if (step.after) {
                // The after callbacks from tourSteps are navigation-only (() => void),
                // not full AfterHook ((data: TourData) => void). Cast accordingly.
                navCallbacksRef.current.set(i, step.after as () => void);
            }
            // Return step without `after` — Joyride won't auto-fire it on transitions
            const { after: _after, ...rest } = step;
            return rest;
        });
    }, [currentPageRoute, planetId, agentId, routerPush, completedActions]);

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

    // Get the current step's target selector (only the step we're about to show)
    const currentStepTarget = useMemo<string | null>(() => {
        const step = steps[currentPageIndex];
        if (!step || !step.target || step.target === 'body' || typeof step.target !== 'string') {
            return null;
        }
        return step.target;
    }, [steps, currentPageIndex]);

    // ── MutationObserver for target readiness ─────────────────────────
    // Waits only for the current step's target element to be present in the DOM
    // before allowing Joyride to render. This prevents the overlay from blocking
    // the page while async data (useSimulationQuery) is still loading.
    useEffect(() => {
        // If tour not active or no steps, no need to wait
        if (!isTourActive || steps.length === 0) {
            setTargetsReady(true);
            return;
        }

        // Body-target or no-target steps (e.g. navigation steps) have no real targets to wait for
        if (!currentStepTarget) {
            setTargetsReady(true);
            return;
        }

        // Quick check — maybe the target is already in the DOM
        if (document.querySelector(currentStepTarget)) {
            setTargetsReady(true);
            return;
        }

        // Target doesn't exist yet — hide Joyride until it appears
        setTargetsReady(false);

        // Observe DOM for the current step's target to appear
        const observer = new MutationObserver(() => {
            if (document.querySelector(currentStepTarget)) {
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
    }, [isTourActive, steps, currentStepTarget]);

    // ── Navigation guard: block accidental navigation away from the tour ────
    // When the user clicks "Leave anyway", end the tour (set localStorage) then let them through.
    const handleGuardForceLeave = useCallback(() => {
        completeTour();
    }, [completeTour]);

    useNavigationGuard(isTourActive, handleGuardForceLeave);

    // If the tour is not active, not mounted yet, or we're not on a tour page, render nothing.
    // Also hide joyride during inter-page navigation or while waiting for DOM targets.
    if (!mounted || !isTourActive || !currentPageRoute || !planetId || navigating || !targetsReady) {
        return null;
    }

    if (steps.length === 0) {
        return null;
    }

    // Guard against out-of-bounds stepIndex: if currentPageIndex is beyond the last step,
    // reset it to the last valid step. This prevents Joyride from rendering an overlay
    // without a tooltip when the index has drifted (e.g. due to missing prev handling or
    // other edge cases).
    const safeStepIndex = Math.min(currentPageIndex, steps.length - 1);

    const handleOnEvent: EventHandler = (data) => {
        const { action, index, status, type } = data;

        const currentStep = steps[index];
        // Detect nav steps by checking our stored callbacks instead of step.after
        const isNavStep = currentStep?.target === 'body' && navCallbacksRef.current.has(index);

        // Steps with data.blocking: true advance programmatically (e.g. via mutation callback),
        // so we should not auto-advance on "next" click for them.
        const stepData = (currentStep as { data?: Record<string, unknown> })?.data ?? {};
        const isBlockingStep = stepData?.blocking === true;

        // Back button: decrement the step index to stay in sync with Joyride's internal index.
        // In Joyride's step:after event, `index` refers to the step being LEFT (source),
        // the same semantics as for "next" where we use index + 1.
        // So for "prev", we need index - 1 to go to the previous step.
        if (type === 'step:after' && action === 'prev') {
            setCurrentPageIndex(Math.max(0, index - 1));
            return;
        }

        // ── Tour completion / skip / close ──────────────────────────────
        // Handle these BEFORE any index advancement so the tour ends cleanly
        // without competing state updates.
        if (status === 'finished' || status === 'skipped' || action === 'close') {
            // For nav-step finished: the navigation will handle completion on the next page.
            // We still need to complete the tour here for non-nav steps (e.g. final "Tour Complete" step).
            if (status === 'finished' && isNavStep) {
                // Navigation step finished — navigate first, then tour ends elsewhere
                const navCallback = navCallbacksRef.current.get(index);
                setNavigating(true);
                setCurrentPageIndex(0);
                setTimeout(() => {
                    navCallback?.();
                }, 0);
                return;
            }

            // For everything else (e.g. "close" button, "skipped", or normal "finished" on last step)
            completeTour();
            return;
        }

        // Navigation steps: before navigating, stop rendering joyride entirely
        // so its overlay is removed. The component will re-mount on the next page.
        if (type === 'step:after' && isNavStep && action === 'next') {
            const navCallback = navCallbacksRef.current.get(index);
            setNavigating(true);
            setCurrentPageIndex(0);
            // Schedule navigation after React removes joyride from the DOM
            setTimeout(() => {
                navCallback?.();
            }, 0);
            return;
        }

        // Regular content step — just advance the index (skip blocking steps that advance programmatically)
        if (type === 'step:after' && action === 'next' && !isBlockingStep) {
            setCurrentPageIndex(index + 1);
        }
    };

    return (
        <Joyride
            steps={steps}
            run={isTourActive}
            continuous
            stepIndex={safeStepIndex}
            onEvent={handleOnEvent}
            tooltipComponent={TourTooltip}
            options={{
                spotlightPadding: 8,
                overlayClickAction: false,
                blockTargetInteraction: true,
            }}
            locale={{
                back: 'Back',
                close: 'Close',
                last: 'Finish',
                next: 'Next',
                open: 'Open the dialog',
                skip: 'Skip tour',
            }}
        />
    );
}
