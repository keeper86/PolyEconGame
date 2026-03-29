'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

const TOAST_ID = 'navigation-guard';
const MESSAGE = 'You have unsaved changes.';
const ACTION_LABEL = 'Leave anyway';
const TOAST_DURATION_MS = 8_000;

/**
 * Warns the user before leaving the current page when `isActive` is true.
 * Covers three navigation paths in the Next.js App Router:
 *  1. Hard reload / tab close  → native browser "Leave site?" dialog via beforeunload
 *  2. <Link> / anchor clicks   → capture-phase document click listener → Sonner warning
 *  3. Browser back / forward   → dummy pushState + popstate listener → Sonner warning
 */
export function useNavigationGuard(isActive: boolean): void {
    const router = useRouter();
    // Track whether we have an extra history entry from this guard so we don't
    // push it repeatedly if the effect re-runs while already active.
    const dummyStatePushedRef = useRef(false);

    useEffect(() => {
        if (!isActive) {
            dummyStatePushedRef.current = false;
            toast.dismiss(TOAST_ID);
            return;
        }

        // ── 1. Hard reload / tab close ─────────────────────────────────────────
        // Only the native browser dialog works here; Sonner cannot intercept this.
        const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener('beforeunload', beforeUnloadHandler);

        // ── 2. <Link> / anchor click navigation ───────────────────────────────
        const clickHandler = (e: MouseEvent) => {
            // Walk up from the click target to find the nearest <a> element.
            let el = e.target as HTMLElement | null;
            while (el && el.tagName !== 'A') {
                el = el.parentElement;
            }
            if (!el) {
                return;
            }

            const href = (el as HTMLAnchorElement).href;
            if (!href) {
                return;
            }

            try {
                const target = new URL(href);
                const current = new URL(window.location.href);
                // Block only real page navigations, not same-page hash changes.
                const isPageNavigation =
                    target.origin !== current.origin ||
                    target.pathname !== current.pathname ||
                    target.search !== current.search;

                if (isPageNavigation) {
                    e.preventDefault();
                    e.stopPropagation();
                    const isSameOrigin = target.origin === current.origin;
                    const destination = isSameOrigin ? target.pathname + target.search + target.hash : href;
                    toast.warning(MESSAGE, {
                        id: TOAST_ID,
                        position: 'top-center',
                        duration: TOAST_DURATION_MS,
                        classNames: { icon: 'text-yellow-500' },
                        action: {
                            label: ACTION_LABEL,
                            onClick: () => {
                                if (isSameOrigin) {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    router.push(destination as any);
                                } else {
                                    window.location.href = destination;
                                }
                            },
                        },
                    });
                }
            } catch {
                // Unparseable href (e.g. javascript:) — let it through.
            }
        };
        // Must use capture phase so we intercept before Next.js's own handler.
        document.addEventListener('click', clickHandler, true);

        // ── 3. Back / forward button (popstate) ────────────────────────────────
        // Push a dummy state so the next "back" press is caught here rather than
        // leaving the page immediately.
        if (!dummyStatePushedRef.current) {
            window.history.pushState(null, '', window.location.href);
            dummyStatePushedRef.current = true;
        }

        const popStateHandler = () => {
            // Re-push to keep the guard in place while the toast is visible.
            window.history.pushState(null, '', window.location.href);
            toast.warning(MESSAGE, {
                id: TOAST_ID,
                position: 'top-center',
                duration: TOAST_DURATION_MS,
                classNames: { icon: 'text-yellow-500' },
                action: {
                    label: ACTION_LABEL,
                    onClick: () => {
                        window.removeEventListener('popstate', popStateHandler);
                        dummyStatePushedRef.current = false;
                        window.history.back();
                    },
                },
            });
        };
        window.addEventListener('popstate', popStateHandler);

        return () => {
            window.removeEventListener('beforeunload', beforeUnloadHandler);
            document.removeEventListener('click', clickHandler, true);
            window.removeEventListener('popstate', popStateHandler);
        };
    }, [isActive, router]);
}
