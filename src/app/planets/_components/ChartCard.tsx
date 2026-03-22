'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useIsMobile, useIsSmallScreen } from '@/hooks/useMobile';
import React from 'react';

type Props = {
    /** Card title rendered on the left. */
    title: string;
    /**
     * Primary controls — always shown right-aligned on the same row as the title.
     * On mobile this sits to the right of the title; on desktop it is pushed to
     * the far right together with `secondaryControls`.
     */
    primaryControls?: React.ReactNode;
    /**
     * Secondary controls — shown inline with `primaryControls` on large screens,
     * but dropped to a second row (right-aligned) on mobile.
     */
    secondaryControls?: React.ReactNode;
    /** Content below the header (the chart itself, legends, etc.). */
    children: React.ReactNode;
};

/**
 * ChartCard — a consistently-styled card for age-cohort charts.
 *
 * Layout rules:
 *   Large  screen: [title ────────── secondaryControls  primaryControls]
 *   Mobile screen: [title ──────────────────────────── primaryControls ]
 *                  [                              secondaryControls     ]
 */
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
