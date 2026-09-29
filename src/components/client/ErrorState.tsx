'use client';

import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

type ErrorStateProps = {
    title?: string;
    description?: string;
    className?: string;
};

export const ErrorState: React.FC<ErrorStateProps> = ({ title, description, className = '' }) => {
    const t = useTranslations('Common');
    return (
        <div className={cn('flex items-center justify-center min-h-[400px] px-4', className)}>
            <Alert variant='destructive' className='w-full max-w-xl'>
                <AlertTitle>{title ?? t('errorTitle')}</AlertTitle>
                <AlertDescription>{description ?? t('errorDescription')}</AlertDescription>
            </Alert>
        </div>
    );
};
