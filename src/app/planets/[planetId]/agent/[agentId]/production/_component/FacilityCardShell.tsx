import { defaultHeight } from '@/components/client/FacilityOrShipIcon';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import React from 'react';

export function FacilityCardShell({
    icon,
    headerContent,
    children,
    className,
    contentClassName,
}: {
    icon: React.ReactNode;
    headerContent: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
}): React.ReactElement {
    return (
        <Card className={cn('overflow-hidden flex flex-col min-w-[300px] sm:min-w-[485px]', className)}>
            <CardHeader className='p-3 pb-2'>
                <div className='flex items-center gap-3 flex-wrap-reverse'>
                    <div className='flex-1 min-w-[150px]' style={{ minHeight: `${defaultHeight}px` }}>
                        {headerContent}
                    </div>
                    <span className='center inline-block my-auto mx-auto'>{icon}</span>
                </div>
            </CardHeader>
            <CardContent className={cn('px-3 pb-3', 'max-w-[485px] sm:max-w-[485px]', contentClassName)}>
                {children}
            </CardContent>
        </Card>
    );
}
