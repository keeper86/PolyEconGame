'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

const TOAST_ID = 'navigation-guard';
const TOAST_DURATION_MS = 8_000;

export type NavigationGuardOptions = {
    message?: string;
    actionLabel?: string;
    /** Use toast.info styling instead of toast.warning */
    infoStyle?: boolean;
};

export function useNavigationGuard(
    isActive: boolean,
    onForceLeave?: () => void,
    options?: NavigationGuardOptions,
): void {
    const router = useRouter();
    const t = useTranslations('Guards');
    const defaultMessage = t('unsavedChanges');
    const defaultActionLabel = t('leaveAnyway');

    const dummyStatePushedRef = useRef(false);

    useEffect(() => {
        if (!isActive) {
            dummyStatePushedRef.current = false;
            toast.dismiss(TOAST_ID);
            return;
        }

        const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
            e.preventDefault();

            e.returnValue = '';
        };
        window.addEventListener('beforeunload', beforeUnloadHandler);

        const clickHandler = (e: MouseEvent) => {
            if (e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
                return;
            }

            let el = e.target as HTMLElement | null;
            while (el && el.tagName !== 'A') {
                el = el.parentElement;
            }
            if (!el) {
                return;
            }

            const anchor = el as HTMLAnchorElement;

            if (anchor.target === '_blank' || anchor.hasAttribute('download') || !anchor.href) {
                return;
            }

            const href = anchor.href;

            try {
                const target = new URL(href);
                const current = new URL(window.location.href);

                const isPageNavigation =
                    target.origin !== current.origin ||
                    target.pathname !== current.pathname ||
                    target.search !== current.search;

                if (isPageNavigation) {
                    e.preventDefault();
                    e.stopPropagation();
                    const isSameOrigin = target.origin === current.origin;
                    const destination = isSameOrigin ? target.pathname + target.search + target.hash : href;
                    const message = options?.message ?? defaultMessage;
                    const actionLabel = options?.actionLabel ?? defaultActionLabel;
                    const showToast = options?.infoStyle ? toast.info : toast.warning;
                    showToast(message, {
                        id: TOAST_ID,
                        position: 'top-center',
                        duration: TOAST_DURATION_MS,
                        classNames: options?.infoStyle ? { icon: 'text-blue-500' } : { icon: 'text-yellow-500' },
                        action: {
                            label: actionLabel,
                            onClick: () => {
                                onForceLeave?.();
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
                // In case of an invalid URL, we don't want to block navigation. So we simply do nothing here.
            }
        };

        document.addEventListener('click', clickHandler, true);

        if (!dummyStatePushedRef.current) {
            window.history.pushState(null, '', window.location.href);
            dummyStatePushedRef.current = true;
        }

        const popStateHandler = () => {
            window.history.pushState(null, '', window.location.href);
            const message = options?.message ?? defaultMessage;
            const actionLabel = options?.actionLabel ?? defaultActionLabel;
            const showToast = options?.infoStyle ? toast.info : toast.warning;
            showToast(message, {
                id: TOAST_ID,
                position: 'top-center',
                duration: TOAST_DURATION_MS,
                classNames: options?.infoStyle ? { icon: 'text-blue-500' } : { icon: 'text-yellow-500' },
                action: {
                    label: actionLabel,
                    onClick: () => {
                        onForceLeave?.();
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
    }, [isActive, router, onForceLeave, options, defaultMessage, defaultActionLabel]);
}
