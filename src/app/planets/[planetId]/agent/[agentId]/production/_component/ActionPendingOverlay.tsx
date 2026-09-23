import { Spinner } from '@/components/ui/spinner';
import React from 'react';

export function ActionPendingOverlay({ message }: { message: string }): React.ReactElement {
    return (
        <div className='absolute inset-0 z-10 flex items-center justify-center bg-background/95 dark:bg-card shadow-inner rounded-b-lg'>
            <span className='flex items-center gap-2 text-sm font-medium text-foreground'>
                <Spinner className='h-4 w-4' />
                {message}
            </span>
        </div>
    );
}
