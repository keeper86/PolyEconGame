import type { FC, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageProps = {
    title: string;
    headerComponent?: ReactNode;
    children?: ReactNode;
    className?: string;
};

export const Page: FC<PageProps> = ({ title, headerComponent, children, className = '' }) => {
    return (
        <div className='max-w-6xl mx-auto py-2 sm:px-4 sm:py-6 space-y-4 sm:space-y-6 relative'>
            <div className={cn('flex items-center justify-between', className)}>
                <h1 className='text-3xl font-bold'>{title}</h1>
                <div className='flex items-center space-x-2'>{headerComponent}</div>
            </div>

            {children}
        </div>
    );
};
