'use client';

import { Button } from '@/components/ui/button';
import { formatNumberWithUnit } from '@/lib/utils';
import { calculateCostsForConstruction } from '@/simulation/planet/facility';
import type { FacilityType } from '@/simulation/planet/facility';
import React, { useMemo, useState } from 'react';
import { ScaleSelector } from './ScaleSelector';

export function FacilityConstructionPanel({
    facilityType,
    fromScale,
    constructionServicePrice,
    planetId,
    label,
    confirmLabel,
    pendingLabel,
    isPending,
    onCancel,
    onConfirm,
    onScaleChange,
}: {
    facilityType: FacilityType;

    fromScale: number;
    constructionServicePrice: number | undefined;
    planetId: string;
    label: string;
    confirmLabel: string;
    pendingLabel: string;
    isPending: boolean;
    onCancel: () => void;
    onConfirm: (targetScale: number) => void;
    onScaleChange?: (targetScale: number) => void;
}): React.ReactElement {
    const minScale = fromScale + 1;
    const [targetScale, setTargetScale] = useState(minScale);

    const handleScaleChange = (v: number) => {
        setTargetScale(v);
        onScaleChange?.(v);
    };

    const cost = useMemo(
        () => calculateCostsForConstruction(facilityType, fromScale, targetScale),
        [facilityType, fromScale, targetScale],
    );
    const estimatedCredits =
        constructionServicePrice && constructionServicePrice > 0 ? cost * constructionServicePrice : null;

    return (
        <>
            <p className='text-xs font-medium'>{label}</p>
            <ScaleSelector value={targetScale} min={minScale} onChange={handleScaleChange} />
            <p className='text-xs text-muted-foreground'>
                Cost:{' '}
                <span className='tabular-nums font-medium text-foreground'>{formatNumberWithUnit(cost, 'units')}</span>{' '}
                construction
                {estimatedCredits !== null && (
                    <>
                        {' '}
                        <span className='text-muted-foreground'>≈</span>{' '}
                        <span className='tabular-nums font-medium text-foreground'>
                            {formatNumberWithUnit(estimatedCredits, 'currency', planetId)}
                        </span>
                    </>
                )}
            </p>
            <div className='flex gap-2'>
                <Button size='sm' variant='outline' className='flex-1 text-xs' onClick={onCancel}>
                    Cancel
                </Button>
                <Button
                    size='sm'
                    className='flex-1 text-xs'
                    disabled={isPending}
                    onClick={() => onConfirm(targetScale)}
                >
                    {isPending ? pendingLabel : confirmLabel}
                </Button>
            </div>
        </>
    );
}
