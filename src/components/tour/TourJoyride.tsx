'use client';

import { useTour } from '@/components/tour/TourContext';
import { getStepsForPage, type PageRoute } from '@/components/tour/tourSteps';
import { useAgentId } from '@/hooks/useAgentId';
import { useNavigationGuard } from '@/hooks/useNavigationGuard';
import { TourTooltip } from '@/components/tour/TourTooltip';
import dynamic from 'next/dynamic';
import { useParams, usePathname } from 'next/navigation';
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
    const { isTourActive, currentStepIndex, completeTour, setCurrentStepIndex, completedActions, goToNextPage } =
        useTour();
    const { agentId: resolvedAgentId } = useAgentId() as { agentId: string | null };

    const [mounted, setMounted] = useState(false);
    // Wait for the current step's data-tour target element to be present in the
    // DOM before rendering Joyride. This prevents the overlay from blocking the
    // page while async data (useSimulationQuery) is still loading.
    const [targetsReady, setTargetsReady] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const currentPageRoute = useMemo(() => pathToPageRoute(pathname), [pathname]);

    // Extract planetId from URL params (always present on tour pages)
    const planetId = (params?.planetId as string) ?? '';

    // Resolve agentId: prefer URL param (for agent pages), fall back to hook result
    const agentId = (params?.agentId as string) || (resolvedAgentId ?? '');

    // Compute steps (tourSteps no longer includes `after` callbacks — navigation
    // is handled centrally via goToNextPage).
    const steps = useMemo(() => {
        if (!currentPageRoute || !planetId) {
            return [];
        }
        return getStepsForPage(currentPageRoute, planetId, agentId, completedActions);
    }, [currentPageRoute, planetId, agentId, completedActions]);

    // ── Route-change reset ──────────────────────────────────────────────
    // When the page route changes, reset targetsReady so Joyride is hidden
    // until the new page's data-tour elements appear in the DOM. The
    // MutationObserver effect will automatically re-detect them.
    const prevPageRouteRef = useRef(currentPageRoute);
    useEffect(() => {
        if (prevPageRouteRef.current !== currentPageRoute) {
            prevPageRouteRef.current = currentPageRoute;
            setTargetsReady(false);
        }
    }, [currentPageRoute]);

    // ── MutationObserver for target readiness ─────────────────────────
    // Waits only for the current step's target element to be present in the DOM
    // before allowing Joyride to render. This prevents the overlay from blocking
    // the page while async data (useSimulationQuery) is still loading.
    // A timeout fallback ensures the tour doesn't get stuck if the target never appears.
    const targetSelectorRef = useRef<string | null>(null);

    useEffect(() => {
        // If tour not active or no steps, no need to wait
        if (!isTourActive || steps.length === 0) {
            setTargetsReady(true);
            targetSelectorRef.current = null;
            return;
        }

        const step = steps[currentStepIndex];
        const target = step?.target;
        const stepData = (step as { data?: Record<string, unknown> })?.data ?? {};
        const targetSelector = target && target !== 'body' && typeof target === 'string' ? target : null;

        // Body-target or no-target steps have no real targets to wait for
        if (!targetSelector) {
            setTargetsReady(true);
            targetSelectorRef.current = null;
            return;
        }

        targetSelectorRef.current = targetSelector;

        // Quick check — maybe the target is already in the DOM
        if (document.querySelector(targetSelector)) {
            setTargetsReady(true);
            return;
        }

        // Target doesn't exist yet — hide Joyride until it appears
        setTargetsReady(false);

        // Observe DOM for the current step's target to appear.
        // Also set a timeout as fallback: if the target hasn't appeared
        // within timeoutMs (default 30s, configurable via step data),
        // show Joyride anyway so the tour doesn't get stuck.
        const timeoutMs = (stepData.timeoutMs as number) ?? 30000;
        const timeoutId = setTimeout(() => {
            setTargetsReady(true);
        }, timeoutMs);

        const observer = new MutationObserver(() => {
            if (document.querySelector(targetSelector)) {
                observer.disconnect();
                clearTimeout(timeoutId);
                setTargetsReady(true);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            observer.disconnect();
            clearTimeout(timeoutId);
        };
    }, [isTourActive, steps, currentStepIndex, setCurrentStepIndex]);
    // ── Navigation guard: block accidental navigation away from the tour ────
    // When the user clicks "Leave anyway", end the tour (set localStorage) then let them through.
    const handleGuardForceLeave = useCallback(() => {
        completeTour();
    }, [completeTour]);

    useNavigationGuard(isTourActive, handleGuardForceLeave, {
        message: 'The guided tour is active. Navigating away will end the tutorial.',
        actionLabel: 'End tutorial & leave',
        infoStyle: true,
    });

    // If the tour is not active, not mounted yet, or we're not on a tour page, render nothing.
    // Also hide joyride during inter-page navigation or while waiting for DOM targets.
    if (!mounted || !isTourActive || !currentPageRoute || !planetId || !targetsReady) {
        return null;
    }

    if (steps.length === 0) {
        return null;
    }

    // Guard against out-of-bounds stepIndex: if currentStepIndex is beyond the last step,
    // reset it to the last valid step. This prevents Joyride from rendering an overlay
    // without a tooltip when the index has drifted (e.g. due to missing prev handling or
    // other edge cases).
    const safeStepIndex = Math.min(currentStepIndex, steps.length - 1);

    const handleOnEvent: EventHandler = (data) => {
        const { action, index, status, type } = data;

        const currentStep = steps[index];
        // Detect nav steps by checking data.navStep (set in tourSteps for navigation steps)
        const stepData = (currentStep as { data?: Record<string, unknown> })?.data ?? {};
        const isNavStep = stepData?.navStep === true;

        // Steps with data.blocking: true advance programmatically (e.g. via mutation callback),
        // so we should not auto-advance on "next" click for them.
        const isBlockingStep = stepData?.blocking === true;

        // Back button: decrement the step index to stay in sync with Joyride's internal index.
        // In Joyride's step:after event, `index` refers to the step being LEFT (source),
        // the same semantics as for "next" where we use index + 1.
        // So for "prev", we need index - 1 to go to the previous step.
        if (type === 'step:after' && action === 'prev') {
            setCurrentStepIndex(Math.max(0, index - 1));
            return;
        }

        // ── Tour completion / skip / close ──────────────────────────────
        // Handle these BEFORE any index advancement so the tour ends cleanly
        // without competing state updates.
        if (status === 'finished' || status === 'skipped' || action === 'close') {
            // For nav-step finished: goToNextPage handles navigation.
            // We still need to complete the tour here for non-nav steps (e.g. final "Tour Complete" step).
            if (status === 'finished' && isNavStep) {
                // Hide joyride overlay first, then navigate after React has removed
                // Joyride from the DOM. Without the deferral, the overlay persists
                // during page transition and blocks the new page.
                setTargetsReady(false);
                setTimeout(() => {
                    goToNextPage(currentPageRoute, planetId, agentId);
                }, 0);
                return;
            }

            completeTour();
            return;
        }

        // Navigation steps: hide Joyride immediately so the overlay is removed
        // before the new page starts rendering. The route change effect will
        // reset targetsReady and the MutationObserver will re-detect targets.
        // goToNextPage resets the step index to 0 via persist.
        if (type === 'step:after' && isNavStep && action === 'next') {
            // Hide joyride overlay first, then navigate after React has removed
            // Joyride from the DOM. Without the deferral, the overlay persists
            // during page transition and blocks the new page.
            setTargetsReady(false);
            setTimeout(() => {
                goToNextPage(currentPageRoute, planetId, agentId);
            }, 0);
            return;
        }

        // Regular content step — just advance the index (skip blocking steps that advance programmatically)
        // If this is the last step, the "Finish" button was clicked — complete the tour.
        // Joyride does not fire status: 'finished' in this case; it just fires step:after with action: 'next'.
        if (type === 'step:after' && action === 'next' && !isBlockingStep) {
            if (index === steps.length - 1) {
                completeTour();
            } else {
                setCurrentStepIndex(index + 1);
            }
        }
    };

    return (
        <>
            {/*
                Invisible anchor for centered/informational tooltip steps.
                Avoids spotlighting the entire <body> which would overlay
                and disable all user interaction.
            */}
            <div data-tour='tour-modal-anchor' className='fixed left-1/2 top-1/2 size-0' aria-hidden='true' />
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
        </>
    );
}
