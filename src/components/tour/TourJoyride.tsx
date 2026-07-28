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
    const [targetsReady, setTargetsReady] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const currentPageRoute = useMemo(() => pathToPageRoute(pathname), [pathname]);

    const planetId = (params?.planetId as string) ?? '';
    const agentId = (params?.agentId as string) || (resolvedAgentId ?? '');

    const steps = useMemo(() => {
        if (!currentPageRoute || !planetId) {
            return [];
        }
        return getStepsForPage(currentPageRoute, planetId, agentId, completedActions);
    }, [currentPageRoute, planetId, agentId, completedActions]);

    const prevPageRouteRef = useRef(currentPageRoute);
    useEffect(() => {
        if (prevPageRouteRef.current !== currentPageRoute) {
            prevPageRouteRef.current = currentPageRoute;
            setTargetsReady(false);
            setCurrentStepIndex(0);
        }
    }, [currentPageRoute, setCurrentStepIndex]);

    const targetSelectorRef = useRef<string | null>(null);

    useEffect(() => {
        if (!isTourActive || steps.length === 0) {
            setTargetsReady(true);
            targetSelectorRef.current = null;
            return;
        }

        const step = steps[currentStepIndex];
        const target = step?.target;
        const stepData = (step as { data?: Record<string, unknown> })?.data ?? {};
        const targetSelector = target && target !== 'body' && typeof target === 'string' ? target : null;

        if (!targetSelector) {
            setTargetsReady(true);
            targetSelectorRef.current = null;
            return;
        }

        const prevTargetSelector = targetSelectorRef.current;
        targetSelectorRef.current = targetSelector;

        if (document.querySelector(targetSelector)) {
            if (prevTargetSelector && targetSelector !== prevTargetSelector) {
                setTargetsReady(false);
                requestAnimationFrame(() => setTargetsReady(true));
                return;
            }
            setTargetsReady(true);
            return;
        }

        setTargetsReady(false);

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

    const handleGuardForceLeave = useCallback(() => {
        completeTour();
    }, [completeTour]);

    useNavigationGuard(isTourActive, handleGuardForceLeave, {
        message: 'The guided tour is active. Navigating away will end the tutorial.',
        actionLabel: 'End tutorial & leave',
        infoStyle: true,
    });

    if (!mounted || !isTourActive || !currentPageRoute || !planetId || !targetsReady) {
        return null;
    }

    if (steps.length === 0) {
        return null;
    }

    const safeStepIndex = Math.min(currentStepIndex, steps.length - 1);

    const handleOnEvent: EventHandler = (data) => {
        const { action, index, status, type } = data;

        const currentStep = steps[index];
        const stepData = (currentStep as { data?: Record<string, unknown> })?.data ?? {};
        const isNavStep = stepData?.navStep === true;
        const isBlockingStep = stepData?.blocking === true;

        if (type === 'step:after' && action === 'prev') {
            setCurrentStepIndex(Math.max(0, index - 1));
            return;
        }

        if (status === 'finished' || status === 'skipped' || action === 'close') {
            if (status === 'finished' && isNavStep) {
                setTargetsReady(false);
                setTimeout(() => {
                    goToNextPage(currentPageRoute, planetId, agentId);
                }, 0);
                return;
            }

            completeTour();
            return;
        }

        if (type === 'step:after' && isNavStep && action === 'next') {
            setTargetsReady(false);
            setTimeout(() => {
                goToNextPage(currentPageRoute, planetId, agentId);
            }, 0);
            return;
        }

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
