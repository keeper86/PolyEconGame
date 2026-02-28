'use client';

import React from 'react';
import { Skeleton } from '../../components/ui/skeleton';

/**
 * Placeholder skeleton that reserves the same vertical space as the loaded
 * Workforce Demography panel.  Prevents layout shifts while data loads.
 */
export function WorkforceSkeleton(): React.ReactElement {
    return (
        <div className='space-y-4 animate-in fade-in duration-200'>
            {/* KPI row */}
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className='rounded-lg border p-3 space-y-2'>
                        <Skeleton className='h-3 w-20' />
                        <Skeleton className='h-6 w-16' />
                        <Skeleton className='h-3 w-24' />
                    </div>
                ))}
            </div>
            {/* Table placeholder */}
            <div className='rounded-lg border p-3 space-y-2'>
                <Skeleton className='h-3 w-32' />
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className='h-5 w-full' />
                ))}
            </div>
            {/* Charts placeholder */}
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                <Skeleton className='h-[200px] rounded-lg' />
                <Skeleton className='h-[200px] rounded-lg' />
            </div>
            {/* Pipeline placeholder */}
            <Skeleton className='h-10 rounded-lg' />
        </div>
    );
}
