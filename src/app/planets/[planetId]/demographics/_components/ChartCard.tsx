'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useIsMobile, useIsSmallScreen } from '@/hooks/useMobile';
import React from 'react';

type Props = {
    title: string;

    primaryControls?: React.ReactNode;

    secondaryControls?: React.ReactNode;

    children: React.ReactNode;
};

export default function ChartCard({ title, primaryControls, secondaryControls, children }: Props): React.ReactElement {
    const isMobile = useIsMobile();
    const isVerySmall = useIsSmallScreen();

    const header = isMobile ? (
        <div className='flex flex-col gap-1'>
            <CardTitle className='text-sm font-medium flex items-center justify-between'>
                {title}
                {primaryControls}
            </CardTitle>
            {secondaryControls && <div className='flex justify-end'>{secondaryControls}</div>}
        </div>
    ) : (
        <CardTitle className='text-sm font-medium flex items-center justify-between'>
            {title}
            <div className='flex items-center gap-2'>
                {secondaryControls}
                {primaryControls}
            </div>
        </CardTitle>
    );

    return (
        <Card>
            <div style={isVerySmall ? { marginLeft: '-10px' } : undefined}>
                <CardHeader className='pb-2'>{header}</CardHeader>
                <CardContent>{children}</CardContent>
            </div>
        </Card>
    );
}
