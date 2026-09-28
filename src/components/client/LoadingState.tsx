'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

type LoadingStateProps = {
    message?: string;
    minHeight?: string;
    className?: string;
};

export const LoadingState: React.FC<LoadingStateProps> = ({ message, minHeight = 'min-h-[400px]', className = '' }) => {
    const t = useTranslations('Common');
    return (
        <div className={cn('flex items-center justify-center', minHeight, className)}>
            <Card className='w-full max-w-md'>
                <CardContent className='flex items-center justify-center gap-4 p-6'>
                    <Spinner className='h-8 w-8 text-muted-foreground' />
                    <div className='text-sm text-muted-foreground'>{message ?? t('loading')}</div>
                </CardContent>
            </Card>
        </div>
    );
};
