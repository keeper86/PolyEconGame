'use client';

import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
    isLoading: boolean;
    isOwnAgent: boolean;
    children: ReactNode;
};

export function AgentAccessGuard({ isLoading, isOwnAgent, children }: Props) {
    if (isLoading) {
        return null;
    }

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

    return <>{children}</>;
}
