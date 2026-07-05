'use client';

import { Button } from '@/components/ui/button';
import { formatNumberWithUnit } from '@/lib/utils';
import { calculateCostsForConstruction } from '@/simulation/planet/facility';
import type { FacilityType } from '@/simulation/planet/facility';
import { LogSlider } from '@/components/ui/log-slider';
import React, { useMemo, useState } from 'react';

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

    // Build logarithmic scale values based on the current fromScale
    const scaleValues = useMemo(() => {
        const base = fromScale === 0 ? 1 : fromScale;
        const raw = [
            base,
            Math.round(base * 1.3),
            Math.round(base * 1.5),
            Math.round(base * 2),
            Math.round(base * 5),
            Math.round(base * 10),
            Math.round(base * 100),
            Math.round(base * 1000),
        ];
        // Deduplicate while preserving order
        const filtered = raw.filter((v, i, arr) => arr.indexOf(v) === i && v > fromScale);
        let factor = 10000;
        for (let i = filtered.length; i < 8; i++) {
            filtered.push(Math.round(factor * base));
            factor *= 10;
        }
        return filtered;
    }, [fromScale]);

    // Map the current targetScale to the closest index in scaleValues
    const sliderIndex = scaleValues.indexOf(targetScale);
    const currentIndex = sliderIndex !== -1 ? sliderIndex : 0;

    const handleSliderChange = (index: number) => {
        const v = scaleValues[index];
        if (v !== undefined) {
            handleScaleChange(v);
        }
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
            <LogSlider
                values={scaleValues}
                value={currentIndex}
                onValueChange={handleSliderChange}
                className='w-full'
                formatLabel={(n) => formatNumberWithUnit(n, 'none')}
            />
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
