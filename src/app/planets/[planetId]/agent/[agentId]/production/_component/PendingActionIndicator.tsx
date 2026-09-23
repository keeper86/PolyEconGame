import { Spinner } from '@/components/ui/spinner';
import React from 'react';

export function PendingActionIndicator({ message }: { message: string }): React.ReactElement {
    return (
        <div className='flex items-center justify-center gap-2 rounded-lg bg-muted/70 py-2 text-sm font-medium text-foreground'>
            <Spinner className='h-4 w-4' />
            {message}
        </div>
    );
}
