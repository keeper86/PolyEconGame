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
        <Card className={cn('overflow-hidden flex flex-col min-w-[300px]', className)}>
            <CardHeader className='p-3 pb-2'>
                <div className='flex items-start gap-3'>
                    {icon}
                    <div className='flex-1 min-w-[150px]'>{headerContent}</div>
                </div>
            </CardHeader>
            <CardContent className={cn('px-3 pb-3', contentClassName)}>{children}</CardContent>
        </Card>
    );
}
