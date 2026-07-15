'use client';

import { useGameConfig } from '@/components/client/GameConfigContext';
import { Stat } from '@/components/client/Stat';
import { mapTickToDate } from '@/components/client/TickDisplay';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { LogSlider } from '@/components/ui/log-slider';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { useSimulationTick } from '@/hooks/useSimulationQuery';
import { formatNumberWithUnit, formatWallTime } from '@/lib/utils';
import { TICKS_PER_MONTH } from '@/simulation/constants';
import type { FacilityType } from '@/simulation/planet/facility';
import { calculateCostsForConstruction } from '@/simulation/planet/facility';
import { AlertTriangle, Clock, Percent, Timer, TrendingDown, Wallet } from 'lucide-react';
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
    financials,
    onCancel,
    onConfirm,
    onScaleChange,
}: {
    facilityType: FacilityType;

    fromScale: number;
    constructionServicePrice: number;
    planetId: string;
    label: string;
    confirmLabel: string;
    pendingLabel: string;
    isPending: boolean;
    financials?: { deposits: number; monthlyNetCashFlow: number };
    onCancel: () => void;
    onConfirm: (targetScale: number) => void;
    onScaleChange?: (targetScale: number) => void;
}): React.ReactElement {
    const minScale = fromScale + 1;
    const [targetScale, setTargetScale] = useState(minScale);
    const [showWarning, setShowWarning] = useState(false);

    const smallScreen = useIsSmallScreen();
    const { tickIntervalMs } = useGameConfig();
    const currentTick = useSimulationTick();

    const handleScaleChange = (v: number) => {
        setTargetScale(v);
        onScaleChange?.(v);
    };

    // Build logarithmic scale values based on the current fromScale
    const scaleValues = useMemo(() => {
        const base = fromScale + 1;
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

    const { cost, time } = useMemo(
        () => calculateCostsForConstruction(facilityType, fromScale, targetScale),
        [facilityType, fromScale, targetScale],
    );
    const estimatedCosts = cost * constructionServicePrice;

    const deposits = financials?.deposits ?? 0;
    const monthlyNetCashFlow = financials?.monthlyNetCashFlow ?? 0;

    const estimatedDepositsDuringBuildingTime = (monthlyNetCashFlow / TICKS_PER_MONTH) * time + deposits;

    const cannotAfford = estimatedCosts > estimatedDepositsDuringBuildingTime;

    const handleConfirmClick = () => {
        if (cannotAfford) {
            setShowWarning(true);
        } else {
            onConfirm(targetScale);
        }
    };

    const handleProceedAnyway = () => {
        setShowWarning(false);
        onConfirm(targetScale);
    };

    const handleCancelWarning = () => {
        setShowWarning(false);
    };

    const colorClassCosts = cannotAfford
        ? 'text-outline-strong text-red-600'
        : estimatedCosts > deposits
          ? 'text-outline-strong text-amber-600'
          : 'text-outline-strong text-green-600';

    const wallTimeMs = time * tickIntervalMs;
    const completionDate = mapTickToDate(currentTick + Math.ceil(time), smallScreen);

    return (
        <>
            <p className='text-xs font-medium text-muted-foreground pt-2'>{label}</p>
            <LogSlider
                values={scaleValues}
                value={currentIndex}
                onValueChange={handleSliderChange}
                className='w-full pt-1'
                formatLabel={(n) => formatNumberWithUnit(n, 'none')}
            />
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 pb-1'>
                <div className='grid grid-cols-1 gap-y-1'>
                    <Stat
                        label='Estimated costs'
                        value={formatNumberWithUnit(estimatedCosts, 'currency', planetId)}
                        icon={<TrendingDown className='h-3 w-3' />}
                    />
                    <Stat label='Completion' value={completionDate} icon={<Clock className='h-3 w-3' />} />
                    <Stat
                        label='Duration'
                        value={formatWallTime(wallTimeMs, smallScreen)}
                        icon={<Timer className='h-3 w-3' />}
                    />
                </div>
                <div className='grid grid-cols-1 gap-y-1'>
                    <Stat
                        label='Deposits'
                        value={formatNumberWithUnit(deposits, 'currency', planetId)}
                        icon={<Wallet className='h-3 w-3' />}
                    />
                    <Stat
                        label='Monthly cash flow'
                        value={formatNumberWithUnit(monthlyNetCashFlow, 'currency', planetId)}
                        icon={<Percent className='h-3 w-3' />}
                    />
                    <Stat
                        label='Estimated deposits'
                        value={formatNumberWithUnit(
                            estimatedDepositsDuringBuildingTime - estimatedCosts,
                            'currency',
                            planetId,
                        )}
                        icon={<TrendingDown className='h-3 w-3' />}
                        valueClassName={colorClassCosts}
                    />
                </div>
            </div>

            <div className='flex gap-2'>
                <Button size='sm' variant='destructive' className='flex-1 text-xs' onClick={onCancel}>
                    Cancel
                </Button>
                <Button size='sm' className={`flex-1`} disabled={isPending} onClick={handleConfirmClick}>
                    <span className={`font-bold text-[14px] dark:text-[12px] ${colorClassCosts}`}>
                        {isPending ? pendingLabel : confirmLabel}
                    </span>
                </Button>
            </div>

            {/* Warning dialog */}
            <Dialog open={showWarning} onOpenChange={setShowWarning}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className='flex items-center gap-2'>
                            <AlertTriangle className='h-5 w-5 text-amber-600 dark:text-amber-400' />
                            Insufficient Funds
                        </DialogTitle>
                        <DialogDescription>
                            Your current deposits together with your estimated cashflow (
                            {formatNumberWithUnit(estimatedDepositsDuringBuildingTime, 'currency', planetId)}) may not
                            cover the estimated cost of {formatNumberWithUnit(estimatedCosts, 'currency', planetId)}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className='rounded-md bg-muted p-3 text-xs space-y-1'>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Shortfall</span>
                            <span className='font-medium text-destructive'>
                                {formatNumberWithUnit(
                                    estimatedCosts - estimatedDepositsDuringBuildingTime,
                                    'currency',
                                    planetId,
                                )}
                            </span>
                        </div>
                    </div>
                    <DialogFooter>
                        <div className='flex gap-2 pt-1 w-full'>
                            <Button
                                size='sm'
                                className='flex-1 text-xs gap-1'
                                variant='destructive'
                                onClick={handleCancelWarning}
                            >
                                Cancel
                            </Button>
                            <Button
                                size='sm'
                                className='flex-1 text-xs gap-1'
                                variant='default'
                                onClick={handleProceedAnyway}
                            >
                                Proceed anyway
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
