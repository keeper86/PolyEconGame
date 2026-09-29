'use client';

import { Progress } from '@/components/ui/progress';
import React from 'react';
import { useTranslations } from 'next-intl';

export function ShipBuildProgressRow({
    shipName,
    progress,
}: {
    shipName: string;
    progress: number;
}): React.ReactElement {
    const t = useTranslations('Ships');
    return (
        <div>
            <div className='flex justify-between text-xs text-muted-foreground mb-1'>
                <span>{t('status.building', { name: shipName })}</span>
                <span className='tabular-nums font-medium text-foreground'>{Math.round(progress * 100)}%</span>
            </div>
            <Progress value={progress * 100} className='h-2' />
        </div>
    );
}
