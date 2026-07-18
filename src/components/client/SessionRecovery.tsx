'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

const COOLDOWN_MS = 30_000;
const STORAGE_KEY = 'session-recovery-reload';

/**
 * Detects when the user's session is lost unexpectedly (authenticated → unauthenticated
 * without a deliberate sign-out) and attempts one auto-reload per cooldown window.
 *
 * If a reload was already attempted within the cooldown and the session still won't
 * restore, the user is left on the page with the existing error UI rather than
 * entering an infinite reload loop.
 */
export function SessionRecovery() {
    const { status, data: session } = useSession();
    const wasAuthenticated = useRef(status === 'authenticated');
    const previousStatus = useRef(status);
    const isSigningOut = useRef(false);

    useEffect(() => {
        if (status === 'authenticated') {
            wasAuthenticated.current = true;
        }

        // Track deliberate sign-outs: transition from 'authenticated' → 'loading' with null session.
        // This avoids setting the flag on initial page load when status is also 'loading' with null session.
        if (previousStatus.current === 'authenticated' && status === 'loading' && session === null) {
            isSigningOut.current = true;
        }
        previousStatus.current = status;

        if (status === 'unauthenticated' && wasAuthenticated.current && !isSigningOut.current) {
            const lastReload = sessionStorage.getItem(STORAGE_KEY);
            const now = Date.now();

            // Only allow one auto-reload every COOLDOWN_MS to prevent infinite loops
            if (!lastReload || now - Number.parseInt(lastReload, 10) > COOLDOWN_MS) {
                sessionStorage.setItem(STORAGE_KEY, now.toString());
                window.location.reload();
            }
        }

        // Reset flag once fully unauthenticated after a deliberate sign-out
        if (status === 'unauthenticated' && isSigningOut.current) {
            isSigningOut.current = false;
        }
    }, [status, session]);

    return null;
}
