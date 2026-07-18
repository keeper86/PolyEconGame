'use client';

import { ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { NoAssetsMessage } from './NoAssetsMessage';

type Props = {
    isLoading: boolean;
    isOwnAgent: boolean;
    children: ReactNode;
    /** When the user's agentId is still unknown (session not yet resolved), we show loading instead of denial */
    isOwnAgentUnknown?: boolean;
    /**
     * The session is authenticated but the user's agentId is null.
     * This happens with stale cookies after a server restart, or a user without a company
     * who accidentally navigated to an agent URL. Redirect to home instead of showing a confusing shield.
     */
    isAuthenticatedWithoutAgentId?: boolean;
    /** Optional — only needed when the page shows a NoAssetsMessage fallback */
    hasNoAssets?: boolean;
    detailLoading?: boolean;
    agentId?: string;
    planetId?: string;
};

export function AgentAccessGuard({
    isLoading,
    isOwnAgent,
    isOwnAgentUnknown,
    isAuthenticatedWithoutAgentId,
    hasNoAssets,
    detailLoading,
    agentId,
    planetId,
    children,
}: Props) {
    const router = useRouter();

    // ── All hooks before any early return (rules-of-hooks) ────────────────
    useEffect(() => {
        if (isAuthenticatedWithoutAgentId) {
            router.replace('/');
        }
    }, [isAuthenticatedWithoutAgentId, router]);

    // 1) Session loading — don't render anything yet
    if (isLoading) {
        return null;
    }

    // 2) Session resolved but we don't know the user's agentId => treat as loading to avoid denial flash
    if (isOwnAgentUnknown) {
        return null;
    }

    // 2a) Authenticated user but no agentId in session (stale cookie, user without company)
    //     Redirect to landing page instead of showing a misleading "access denied" shield.
    if (isAuthenticatedWithoutAgentId) {
        return null;
    }

    // 3) Access denied (not the agent owner)
    if (!isOwnAgent) {
        return (
            <div className='flex flex-col items-center justify-center gap-4 py-16 text-center'>
                <ShieldAlert className='h-12 w-12 text-muted-foreground' />
                <h2 className='text-xl font-semibold'>Classified Operations</h2>
                <p className='text-sm text-muted-foreground max-w-sm'>
                    You do not have clearance to view the internal operations of this company. Only the company{"'"}s
                    owner can access these facilities.
                </p>
            </div>
        );
    }

    // 4) Own agent — handle the three sub-states
    if (hasNoAssets && agentId && planetId) {
        return <NoAssetsMessage planetId={planetId} agentId={agentId} isOwnAgent={true} />;
    }

    if (detailLoading) {
        return <div className='text-sm text-muted-foreground'>Loading…</div>;
    }

    return <>{children}</>;
}
