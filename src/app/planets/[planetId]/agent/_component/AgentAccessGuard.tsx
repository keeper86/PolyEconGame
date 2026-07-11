'use client';

import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { NoAssetsMessage } from './NoAssetsMessage';

type Props = {
    isLoading: boolean;
    isOwnAgent: boolean;
    children: ReactNode;
    /** When the user's agentId is still unknown (session not yet resolved), we show loading instead of denial */
    isOwnAgentUnknown?: boolean;
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
    hasNoAssets,
    detailLoading,
    agentId,
    planetId,
    children,
}: Props) {
    // 1) Session loading — don't render anything yet
    if (isLoading) {
        return null;
    }

    // 2) Session resolved but we don't know the user's agentId => treat as loading to avoid denial flash
    if (isOwnAgentUnknown) {
        return null;
    }

    // 3) Access denied (not the agent owner)
    if (!isOwnAgent) {
        return (
            <div className='flex flex-col items-center justify-center gap-4 py-16 text-center'>
                <ShieldAlert className='h-12 w-12 text-muted-foreground' />
                <h2 className='text-xl font-semibold'>Classified Operations</h2>
                <p className='text-sm text-muted-foreground max-w-sm'>
                    You do not have clearance to view the internal operations of this company. Only the company&apos;s
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
